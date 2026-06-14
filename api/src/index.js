'use strict';

const fastify = require('fastify')({ logger: true });
const { initDefaultUsers } = require('./db');
const { ensureIsolatedNetwork } = require('./services/docker');

async function main() {
  // Register @fastify/jwt.
  // extractToken supports both the Authorization header (normal REST calls)
  // and a ?token= query param (WebSocket connections, since browsers cannot
  // set custom headers on the WebSocket handshake).
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || (() => {
      console.warn('[startup] WARNING: JWT_SECRET is not set. Using insecure default.');
      return 'insecure-default-secret-change-me';
    })(),
    verify: {
      extractToken: (request) => {
        const auth = request.headers && request.headers.authorization;
        if (auth && auth.startsWith('Bearer ')) {
          return auth.slice(7);
        }
        if (request.query && request.query.token) {
          return request.query.token;
        }
        return undefined;
      },
    },
  });

  // Register @fastify/cors
  await fastify.register(require('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN || 'https://project.acronym.sk',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Register @fastify/rate-limit (global defaults — per-route overrides set in route files)
  await fastify.register(require('@fastify/rate-limit'), {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // Register @fastify/multipart with 500MB file size limit
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB
    },
  });

  // Register @fastify/websocket
  await fastify.register(require('@fastify/websocket'));

  // Register routes
  await fastify.register(require('./routes/auth'));
  await fastify.register(require('./routes/deploy'));
  await fastify.register(require('./routes/projects'));
  await fastify.register(require('./routes/logs'));
  await fastify.register(require('./routes/stats'));
  await fastify.register(require('./routes/env'));
  await fastify.register(require('./routes/exec'));
  await fastify.register(require('./routes/audit'));

  // Initialize default users from ADMIN_USERS env var
  await initDefaultUsers();

  // Ensure the isolated Docker network exists before accepting traffic
  await ensureIsolatedNetwork();

  // Start listening
  await fastify.listen({
    port: 3000,
    host: '0.0.0.0',
  });

  fastify.log.info('Acronym deployment platform API running on 0.0.0.0:3000');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
