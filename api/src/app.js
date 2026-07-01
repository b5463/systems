'use strict';

const Fastify = require('fastify');

// Build (but do not start) the configured Fastify app. Extracted from index.js
// so tests can use app.inject() without binding a port or touching Docker.
async function buildApp(opts = {}) {
  const trustProxy = process.env.TRUST_PROXY === 'false'
    ? false
    : (process.env.TRUST_PROXY ? process.env.TRUST_PROXY === 'true' : false);

  const fastify = Fastify({
    trustProxy,
    ...(opts.fastify || { logger: false }),
  });

  const { sessionToken, validCsrf, clearSessionCookie } = require('./util/session');
  // JWTs are an implementation detail of the server-tracked session. The
  // browser only receives one in an HttpOnly cookie; bearer and query-string
  // credentials are deliberately not accepted.
  await fastify.register(require('@fastify/jwt'), {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
        throw new Error('JWT_SECRET must be at least 32 characters in production.');
      }
      if (process.env.CSRF_SECRET && process.env.NODE_ENV === 'production' && process.env.CSRF_SECRET.length < 32) {
        throw new Error('CSRF_SECRET must be at least 32 characters when set in production.');
      }
      if (secret) return secret;
      console.warn('[startup] WARNING: JWT_SECRET is not set. Using insecure default (dev only).');
      return 'insecure-default-secret-change-me';
    })(),
    verify: {
      extractToken: sessionToken,
    },
  });

  const corsOrigins = [process.env.CORS_ORIGIN || 'https://systems.acronym.sk'];
  if (process.env.NODE_ENV !== 'production') {
    corsOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  await fastify.register(require('@fastify/cors'), {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    credentials: true,
  });

  await fastify.register(require('@fastify/rate-limit'), {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  const { MAX_MULTIPART_BYTES } = require('./util/upload');
  await fastify.register(require('@fastify/multipart'), {
    limits: { fileSize: MAX_MULTIPART_BYTES },
  });

  await fastify.register(require('@fastify/websocket'));

  const { randomUUID } = require('crypto');
  fastify.addHook('onRequest', async (request) => {
    request.requestId = request.headers['x-request-id'] || randomUUID();
  });
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.requestId);
  });

  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    const body = {
      error: error.message || 'Internal Server Error',
      statusCode,
      requestId: request.requestId,
    };
    if (error.validation) {
      body.error = 'Validation failed';
      body.details = error.validation;
    }
    if (statusCode >= 500 && request.log) {
      request.log.error({ err: error, requestId: request.requestId }, '[error] unhandled');
    }
    reply.code(statusCode).send(body);
  });

  // Hardened response headers on every reply (including errors). This API is
  // JSON-only — the dashboard SPA is served separately by the reverse proxy —
  // so the CSP can deny everything: there is no markup, script, style, or frame
  // this service should ever be allowed to emit or be embedded in. HSTS is sent
  // only in production, where traffic is TLS-terminated at Caddy/nginx.
  const isProd = process.env.NODE_ENV === 'production';
  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Permissions-Policy',
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (isProd) reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    reply.removeHeader('X-Powered-By');
    return payload;
  });

  // Decorate authenticate on the ROOT instance so every (encapsulated) route
  // plugin can use it as a preHandler. Enforces JWT validity AND token_version
  // (a stale token after a password change / revoke / deleted user is rejected).
  const { adminRepo, userRepo } = require('./repo');
  const ipmatch = require('./util/ipmatch');
  // Enforce the persistent denylist before auth and route work. Supports both
  // exact IPs (fast indexed lookup) and CIDR ranges (scanned — the denylist is
  // small). Expired bans are ignored; removal is explicit/audited via the admin
  // API. The whole check is wrapped: bans are defense-in-depth layered on auth,
  // so an internal error here must never 500 every request — it fails open and
  // logs, leaving the primary auth control intact.
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const ip = request.ip;
      const exact = await adminRepo.findActiveBanByIp(ip);
      let banned = !!exact;
      if (!banned) {
        const cidrRows = await adminRepo.findActiveCidrBans();
        banned = cidrRows.length > 0 && ipmatch.matchesAny(ip, cidrRows.map((r) => r.ip));
      }
      if (banned) return reply.code(403).send({ error: 'Access denied.' });
    } catch (err) {
      if (request.log) request.log.error({ err }, '[ban] denylist check failed; failing open');
    }
  });

  const crypto = require('crypto');
  const { tokenRepo } = require('./repo');
  const { features } = require('./util/flags');

  async function tryApiTokenAuth(request) {
    if (!features().apiTokens) return false;
    const auth = request.headers && request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer sys_')) return false;
    const raw = auth.slice(7);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const token = await tokenRepo.findByHash(hash);
    if (!token) return false;
    if (token.expires_at && new Date(token.expires_at) < new Date()) return false;
    const user = await userRepo.findById(token.user_id);
    if (!user) return false;
    request.user = { id: user.id, username: user.username, tv: user.token_version || 0 };
    request.apiToken = { id: token.id, scopes: JSON.parse(token.scopes) };
    tokenRepo.touchLastUsed(token.id).catch(() => {});
    return true;
  }

  fastify.decorate('authenticate', async function (request, reply) {
    if (await tryApiTokenAuth(request)) return;

    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized', message: err.message });
    }
    const u = await userRepo.findById(request.user.id);
    if (!u || (request.user.tv ?? 0) !== (u.token_version || 0)) {
      return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
    }
    if (!request.user.jti) return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
    {
      const s = await userRepo.findSessionByJti(request.user.jti);
      if (!s) return reply.code(401).send({ error: 'This session was signed out.' });
      const utc = (value) => {
        if (value instanceof Date) return value.getTime();
        const s = String(value).replace(' ', 'T');
        return Date.parse(s.endsWith('Z') ? s : `${s}Z`);
      };
      const idleMs = (Number(process.env.SESSION_IDLE_MINUTES) || 720) * 60_000;
      const absoluteMs = (Number(process.env.SESSION_ABSOLUTE_HOURS) || 168) * 60 * 60_000;
      const lastSeen = utc(s.last_seen_at);
      const created = utc(s.created_at);
      if (!Number.isFinite(lastSeen) || !Number.isFinite(created)
        || Date.now() - lastSeen > idleMs || Date.now() - created > absoluteMs) {
        await userRepo.deleteSessionById(s.id);
        clearSessionCookie(reply);
        return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
      }
      await userRepo.touchSession(request.user.jti);
    }

    const origin = request.headers && request.headers.origin;
    if (origin) {
      if (!corsOrigins.includes(origin)) {
        return reply.code(403).send({ error: 'Untrusted request origin.' });
      }
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const supplied = request.headers && request.headers['x-csrf-token'];
      if (!validCsrf(request.user.jti, supplied)) {
        return reply.code(403).send({ error: 'Invalid or missing CSRF token.' });
      }
    }
  });

  await fastify.register(require('./routes/auth'));
  await fastify.register(require('./routes/deploy'));
  await fastify.register(require('./routes/projects'));
  await fastify.register(require('./routes/logs'));
  await fastify.register(require('./routes/stats'));
  await fastify.register(require('./routes/env'));
  await fastify.register(require('./routes/exec'));
  await fastify.register(require('./routes/audit'));
  await fastify.register(require('./routes/admin'));
  await fastify.register(require('./routes/server'));
  await fastify.register(require('./routes/attestation'));
  await fastify.register(require('./routes/webhook'));
  await fastify.register(require('./routes/upload'));
  await fastify.register(require('./routes/secrets'));
  await fastify.register(require('./routes/tokens'));
  await fastify.register(require('./routes/nodes'));
  await fastify.register(require('./routes/preview'));
  await fastify.register(require('./routes/buildpipeline'));
  await fastify.register(require('./routes/systems'));
  await fastify.register(require('./routes/products'));

  return fastify;
}

module.exports = { buildApp };
