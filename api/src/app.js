'use strict';

const Fastify = require('fastify');

// Build (but do not start) the configured Fastify app. Extracted from index.js
// so tests can use app.inject() without binding a port or touching Docker.
async function buildApp(opts = {}) {
  const fastify = Fastify({
    trustProxy: !!process.env.REVERSE_PROXY || process.env.TRUST_PROXY === 'true',
    ...(opts.fastify || { logger: false }),
  });

  // @fastify/jwt — accepts the Authorization header or a ?token= query param
  // (WebSocket handshakes can't set custom headers).
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production — refusing to start with an insecure default.');
      }
      console.warn('[startup] WARNING: JWT_SECRET is not set. Using insecure default (dev only).');
      return 'insecure-default-secret-change-me';
    })(),
    verify: {
      extractToken: (request) => {
        const auth = request.headers && request.headers.authorization;
        if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
        if (request.query && request.query.token) return request.query.token;
        return undefined;
      },
    },
  });

  await fastify.register(require('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN || 'https://systems.acronym.sk',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  // Decorate authenticate on the ROOT instance so every (encapsulated) route
  // plugin can use it as a preHandler. Enforces JWT validity AND token_version
  // (a stale token after a password change / revoke / deleted user is rejected).
  const { db } = require('./db');
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized', message: err.message });
    }
    const u = db.prepare('SELECT token_version FROM users WHERE id = ?').get(request.user.id);
    if (!u || (request.user.tv ?? 0) !== (u.token_version || 0)) {
      return reply.code(401).send({ error: 'Session expired. Please sign in again.' });
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
  await fastify.register(require('./routes/webhook'));
  await fastify.register(require('./routes/upload'));

  return fastify;
}

module.exports = { buildApp };
