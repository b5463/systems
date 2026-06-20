'use strict';

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { db, auditLog } = require('../db');
const totp = require('../util/totp');
const lockout = require('../util/lockout');
const { setSessionCookie, clearSessionCookie, csrfToken } = require('../util/session');

// Per-IP login lockout state (in-memory). Escalating backoff after repeated
// credential failures, layered on top of the per-IP rate limit. Pure decision
// logic lives in util/lockout (unit-tested); this just holds the state.
const loginAttempts = new Map();
const _loginCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, s] of loginAttempts) {
    if (s.lockedUntil < now && now - s.lastFailAt > lockout.DEFAULTS.windowMs) {
      loginAttempts.delete(key);
    }
  }
}, 60 * 60_000);
if (_loginCleanup.unref) _loginCleanup.unref();

// A fixed bcrypt hash used only to spend equivalent time on unknown-user logins.
const DUMMY_HASH = '$2b$12$LS.DksBFMLXDgraHFAgGFOqaqkWL1x15NcdADtOyxtIOWJHnW2pK6';

// Issue a token carrying the user's current token_version and a session id
// (jti). Bumping token_version (password change, admin reset, explicit revoke)
// invalidates every previously issued token; the jti enables per-session
// revocation and the device/IP session list.
function signToken(fastify, user, jti) {
  return fastify.jwt.sign(
    { id: user.id, username: user.username, tv: user.token_version || 0, jti },
    { expiresIn: '7d' }
  );
}

// Record a new session row and return a token bound to it.
function createSession(fastify, user, request, reply) {
  const jti = uuidv4();
  const ua = ((request.headers && request.headers['user-agent']) || '').slice(0, 300);
  db.prepare('INSERT INTO sessions (user_id, jti, user_agent, ip) VALUES (?, ?, ?, ?)')
    .run(user.id, jti, ua || null, request.ip || null);
  setSessionCookie(reply, signToken(fastify, user, jti));
  return csrfToken(jti);
}

// Sign-out-everywhere: drop all of this user's sessions, then open a fresh one
// for the current request so the acting admin stays signed in.
function rotateSoleSession(fastify, user, request, reply) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  return createSession(fastify, user, request, reply);
}

async function authRoutes(fastify, options) {
  // `fastify.authenticate` is decorated on the root instance in app.js so all
  // route plugins share it.

  // Rate-limit login aggressively: 10 attempts per minute per IP
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 100 },
          password: { type: 'string', minLength: 1, maxLength: 200 },
          code: { type: 'string', maxLength: 16 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password, code } = request.body;
    const ip = request.ip;

    // Lockout: if this IP has failed too many times recently, refuse early with
    // a Retry-After (HTTP 429) before doing any password work.
    const { locked, retryAfterMs } = lockout.check(loginAttempts.get(ip), Date.now());
    if (locked) {
      const retryAfter = Math.ceil(retryAfterMs / 1000);
      auditLog({ action: 'login_locked', target: username, detail: `retry in ${retryAfter}s`, ip });
      return reply
        .code(429)
        .header('Retry-After', String(retryAfter))
        .send({ error: `Too many failed attempts. Try again in ${retryAfter}s.` });
    }
    const fail = () => loginAttempts.set(ip, lockout.onFailure(loginAttempts.get(ip), Date.now()));

    const user = db
      .prepare('SELECT id, username, password_hash, token_version, totp_enabled, totp_secret FROM users WHERE username = ?')
      .get(username);

    if (!user) {
      // Compare against a dummy hash so an unknown username takes the same time
      // as a known one (no timing oracle for user enumeration).
      await bcrypt.compare(password, DUMMY_HASH);
      fail();
      auditLog({ action: 'login_fail', target: username, detail: 'user not found', ip });
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      fail();
      auditLog({ user_id: user.id, action: 'login_fail', target: username, detail: 'wrong password', ip });
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Two-factor: if enabled, a valid TOTP code is required to complete login.
    if (user.totp_enabled) {
      if (!code) {
        // Password was correct — not a credential failure, so don't count it.
        return reply.code(401).send({ error: 'Two-factor code required.', twoFactorRequired: true });
      }
      if (!totp.verify(code, user.totp_secret)) {
        fail();
        auditLog({ user_id: user.id, action: 'login_fail', target: username, detail: '2fa code invalid', ip });
        return reply.code(401).send({ error: 'Invalid two-factor code.', twoFactorRequired: true });
      }
    }

    // Success — clear any failure streak for this IP.
    loginAttempts.delete(ip);
    const csrf = createSession(fastify, user, request, reply);
    auditLog({ user_id: user.id, action: 'login', target: username, ip });
    return { csrfToken: csrf };
  });

  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id, username } = request.user;
    const row = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(id);
    const session = db.prepare('SELECT created_at FROM sessions WHERE jti = ?').get(request.user.jti);
    return {
      id, username, twoFactorEnabled: !!(row && row.totp_enabled),
      sessionCreatedAt: session && session.created_at, csrfToken: csrfToken(request.user.jti),
    };
  });

  fastify.post('/api/auth/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.jti) db.prepare('DELETE FROM sessions WHERE jti = ?').run(request.user.jti);
    clearSessionCookie(reply);
    auditLog({ user_id: request.user.id, action: 'logout', ip: request.ip });
    return { message: 'Logged out successfully' };
  });

  // List active sessions for the current user (the current one is flagged).
  fastify.get('/api/auth/sessions', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const rows = db.prepare(
      'SELECT id, jti, user_agent, ip, created_at, last_seen_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC'
    ).all(request.user.id);
    return {
      sessions: rows.map((r) => ({
        id: r.id,
        userAgent: r.user_agent,
        ip: r.ip,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        current: r.jti === request.user.jti,
      })),
    };
  });

  // Revoke a single session by id. The revoked session's next request 401s.
  fastify.delete('/api/auth/sessions/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = Number(request.params.id);
    const row = db.prepare('SELECT id, jti FROM sessions WHERE id = ? AND user_id = ?').get(id, request.user.id);
    if (!row) return reply.code(404).send({ error: 'Session not found.' });
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    auditLog({ user_id: request.user.id, action: 'session_revoked', ip: request.ip });
    return { message: 'Session revoked.', current: row.jti === request.user.jti };
  });

  // Change own password — also bumps token_version (signs out other sessions).
  fastify.post('/api/auth/change-password', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1, maxLength: 200 },
          newPassword: { type: 'string', minLength: 15, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Both current and new password are required.' });
    }
    if (newPassword.length < 15) {
      return reply.code(400).send({ error: 'New password must be at least 15 characters.' });
    }

    const user = db
      .prepare('SELECT id, username, password_hash, token_version FROM users WHERE id = ?')
      .get(request.user.id);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Current password is incorrect.' });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    db.prepare(`UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?`).run(password_hash, user.id);

    auditLog({ user_id: user.id, action: 'password_change', target: user.username, ip: request.ip });
    // Re-issue a fresh token so the current session stays signed in; other
    // sessions are dropped (sign-out-everywhere).
    const updated = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(user.id);
    return { message: 'Password updated.', csrfToken: rotateSoleSession(fastify, updated, request, reply) };
  });

  // Sign out everywhere: bump token_version, drop other sessions, hand back a
  // fresh token for the current session.
  fastify.post('/api/auth/revoke-sessions', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    db.prepare(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`).run(request.user.id);
    auditLog({ user_id: request.user.id, action: 'sessions_revoked', ip: request.ip });
    const updated = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(request.user.id);
    return { message: 'Other sessions signed out.', csrfToken: rotateSoleSession(fastify, updated, request, reply) };
  });

  // Refresh token: re-sign for the SAME session (stable jti). Rotating the jti
  // here would orphan the token held by other tabs / in-flight requests and
  // 401 them into a logout, so the session id is kept for the life of the login.
  fastify.post('/api/auth/refresh', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(request.user.id);
    const jti = request.user.jti;
    if (jti) {
      db.prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE jti = ?`).run(jti);
      setSessionCookie(reply, signToken(fastify, user, jti));
      return { csrfToken: csrfToken(jti) };
    }
    return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
  });

  // ─── Two-factor (TOTP) ─────────────────────────────────────────────────────

  // Begin setup: generate a pending secret, return the otpauth URL + secret.
  // Not active until confirmed via /enable with a valid code.
  fastify.post('/api/auth/2fa/setup', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = db.prepare('SELECT id, username, totp_enabled FROM users WHERE id = ?').get(request.user.id);
    if (user.totp_enabled) return reply.code(409).send({ error: 'Two-factor is already enabled.' });
    const secret = totp.generateSecret();
    db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, user.id);
    return { secret, otpauth: totp.otpauthURL(secret, { label: user.username }) };
  });

  // Confirm + enable with a code from the authenticator app.
  fastify.post('/api/auth/2fa/enable', {
    preHandler: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', maxLength: 16 } } } },
  }, async (request, reply) => {
    const user = db.prepare('SELECT id, username, totp_secret, totp_enabled FROM users WHERE id = ?').get(request.user.id);
    if (user.totp_enabled) return reply.code(409).send({ error: 'Two-factor is already enabled.' });
    if (!user.totp_secret) return reply.code(400).send({ error: 'Start setup first.' });
    if (!totp.verify(request.body.code, user.totp_secret)) {
      return reply.code(400).send({ error: 'Code did not verify. Check the time on your device and try again.' });
    }
    // Bump token_version (revokes other sessions) and re-issue this session's
    // token so the admin who just enabled 2FA isn't logged out.
    db.prepare('UPDATE users SET totp_enabled = 1, token_version = token_version + 1 WHERE id = ?').run(user.id);
    auditLog({ user_id: user.id, action: '2fa_enabled', target: user.username, ip: request.ip });
    const updated = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(user.id);
    return { message: 'Two-factor enabled.', csrfToken: rotateSoleSession(fastify, updated, request, reply) };
  });

  // Disable 2FA (requires current password + a valid code).
  fastify.post('/api/auth/2fa/disable', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['password'],
        properties: { password: { type: 'string', maxLength: 200 }, code: { type: 'string', maxLength: 16 } },
      },
    },
  }, async (request, reply) => {
    const user = db.prepare('SELECT id, username, password_hash, totp_secret, totp_enabled FROM users WHERE id = ?').get(request.user.id);
    if (!user.totp_enabled) return reply.code(400).send({ error: 'Two-factor is not enabled.' });
    const okPass = await bcrypt.compare(request.body.password || '', user.password_hash);
    if (!okPass) return reply.code(401).send({ error: 'Password is incorrect.' });
    if (!totp.verify(request.body.code, user.totp_secret)) {
      return reply.code(400).send({ error: 'Code did not verify.' });
    }
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, token_version = token_version + 1 WHERE id = ?').run(user.id);
    auditLog({ user_id: user.id, action: '2fa_disabled', target: user.username, ip: request.ip });
    const updated = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(user.id);
    return { message: 'Two-factor disabled.', csrfToken: rotateSoleSession(fastify, updated, request, reply) };
  });
}

module.exports = authRoutes;
