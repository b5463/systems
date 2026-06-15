'use strict';

const bcrypt = require('bcrypt');
const { db, auditLog } = require('../db');
const totp = require('../util/totp');

// Issue a token carrying the user's current token_version. Bumping
// token_version (password change, admin reset, explicit revoke) invalidates
// every previously issued token for that user.
function signToken(fastify, user) {
  return fastify.jwt.sign(
    { id: user.id, username: user.username, tv: user.token_version || 0 },
    { expiresIn: '7d' }
  );
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

    const user = db
      .prepare('SELECT id, username, password_hash, token_version, totp_enabled, totp_secret FROM users WHERE username = ?')
      .get(username);

    if (!user) {
      auditLog({ action: 'login_fail', target: username, detail: 'user not found', ip });
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      auditLog({ user_id: user.id, action: 'login_fail', target: username, detail: 'wrong password', ip });
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Two-factor: if enabled, a valid TOTP code is required to complete login.
    if (user.totp_enabled) {
      if (!code) {
        return reply.code(401).send({ error: 'Two-factor code required.', twoFactorRequired: true });
      }
      if (!totp.verify(code, user.totp_secret)) {
        auditLog({ user_id: user.id, action: 'login_fail', target: username, detail: '2fa code invalid', ip });
        return reply.code(401).send({ error: 'Invalid two-factor code.', twoFactorRequired: true });
      }
    }

    const token = signToken(fastify, user);
    auditLog({ user_id: user.id, action: 'login', target: username, ip });
    return { token };
  });

  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id, username } = request.user;
    const row = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(id);
    return { id, username, twoFactorEnabled: !!(row && row.totp_enabled) };
  });

  fastify.post('/api/auth/logout', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    auditLog({ user_id: request.user.id, action: 'logout', ip: request.ip });
    return { message: 'Logged out successfully' };
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
          newPassword: { type: 'string', minLength: 8, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Both current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return reply.code(400).send({ error: 'New password must be at least 8 characters.' });
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
    // Re-issue a fresh token so the current session stays signed in.
    const updated = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(user.id);
    return { message: 'Password updated.', token: signToken(fastify, updated) };
  });

  // Sign out everywhere: bump token_version and hand back a fresh token.
  fastify.post('/api/auth/revoke-sessions', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    db.prepare(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`).run(request.user.id);
    auditLog({ user_id: request.user.id, action: 'sessions_revoked', ip: request.ip });
    const updated = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(request.user.id);
    return { message: 'Other sessions signed out.', token: signToken(fastify, updated) };
  });

  // Refresh token (carries token_version forward).
  fastify.post('/api/auth/refresh', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = db.prepare('SELECT id, username, token_version FROM users WHERE id = ?').get(request.user.id);
    return { token: signToken(fastify, user) };
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
    db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
    auditLog({ user_id: user.id, action: '2fa_enabled', target: user.username, ip: request.ip });
    return { message: 'Two-factor enabled.' };
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
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(user.id);
    auditLog({ user_id: user.id, action: '2fa_disabled', target: user.username, ip: request.ip });
    return { message: 'Two-factor disabled.' };
  });
}

module.exports = authRoutes;
