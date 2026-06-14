'use strict';

const bcrypt = require('bcrypt');
const { db, auditLog } = require('../db');

async function authRoutes(fastify, options) {
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: err.message });
    }
  });

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
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;
    const ip = request.ip;

    const user = db
      .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
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

    const token = fastify.jwt.sign(
      { id: user.id, username: user.username },
      { expiresIn: '7d' }
    );

    auditLog({ user_id: user.id, action: 'login', target: username, ip });
    return { token };
  });

  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id, username } = request.user;
    return { id, username };
  });

  fastify.post('/api/auth/logout', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    auditLog({ user_id: request.user.id, action: 'logout', ip: request.ip });
    return { message: 'Logged out successfully' };
  });

  // Refresh token if valid and within 24h of expiry
  fastify.post('/api/auth/refresh', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id, username } = request.user;
    const token = fastify.jwt.sign({ id, username }, { expiresIn: '7d' });
    return { token };
  });
}

module.exports = authRoutes;
