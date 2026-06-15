'use strict';

const bcrypt = require('bcrypt');
const { db, auditLog } = require('../db');

async function adminRoutes(fastify, options) {
  // List all users
  fastify.get('/api/admin/users', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const users = db
      .prepare('SELECT id, username, created_at FROM users ORDER BY created_at ASC')
      .all();
    return { users };
  });

  // Create a new user
  fastify.post('/api/admin/users', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 100 },
          password: { type: 'string', minLength: 8, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required.' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters.' });
    }

    // Hard cap: SYSTEMS. is a two-admin platform. No public signup, ever.
    const adminCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    if (adminCount >= 2) {
      return reply.code(409).send({ error: 'SYSTEMS. allows a maximum of two admins.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return reply.code(409).send({ error: 'A user with this username already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const info = db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(username, password_hash);

    auditLog({ user_id: request.user.id, action: 'user_create', target: username, ip: request.ip });

    const user = db
      .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
      .get(info.lastInsertRowid);
    return reply.code(201).send({ user });
  });

  // Delete a user (cannot delete own account)
  fastify.delete('/api/admin/users/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid user id.' });

    if (id === request.user.id) {
      return reply.code(400).send({ error: 'You cannot delete your own account.' });
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    auditLog({ user_id: request.user.id, action: 'user_delete', target: user.username, ip: request.ip });

    return { message: 'User deleted.' };
  });

  // Admin reset of any user's password
  fastify.patch('/api/admin/users/:id/password', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['newPassword'],
        properties: {
          newPassword: { type: 'string', minLength: 8, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid user id.' });

    const { newPassword } = request.body;
    if (!newPassword || newPassword.length < 8) {
      return reply.code(400).send({ error: 'New password must be at least 8 characters.' });
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    const password_hash = await bcrypt.hash(newPassword, 12);
    // Bump token_version so the reset signs out the target user's sessions.
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(password_hash, id);

    auditLog({ user_id: request.user.id, action: 'password_reset', target: user.username, ip: request.ip });
    return { message: 'Password reset.' };
  });
}

module.exports = adminRoutes;
