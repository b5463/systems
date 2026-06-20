'use strict';

const bcrypt = require('bcrypt');
const { db, auditLog } = require('../db');
const ipmatch = require('../util/ipmatch');
const settings = require('../util/settings');

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
          password: { type: 'string', minLength: 15, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required.' });
    }
    if (password.length < 15) {
      return reply.code(400).send({ error: 'Password must be at least 15 characters.' });
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
          newPassword: { type: 'string', minLength: 15, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid user id.' });

    const { newPassword } = request.body;
    if (!newPassword || newPassword.length < 15) {
      return reply.code(400).send({ error: 'New password must be at least 15 characters.' });
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    const password_hash = await bcrypt.hash(newPassword, 12);
    // Bump token_version so the reset signs out the target user's sessions.
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(password_hash, id);

    auditLog({ user_id: request.user.id, action: 'password_reset', target: user.username, ip: request.ip });
    return { message: 'Password reset.' };
  });

  // Persistent IP denylist for incident response. This is intentionally
  // operator-managed; login backoff remains the safer automatic response.
  fastify.get('/api/admin/ip-bans', {
    preHandler: [fastify.authenticate],
  }, async () => ({
    bans: db.prepare(
      'SELECT id, ip, reason, expires_at, created_at FROM ip_bans ORDER BY created_at DESC'
    ).all(),
  }));

  fastify.post('/api/admin/ip-bans', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['ip'], additionalProperties: false,
        properties: {
          // Either a single IPv4/IPv6 address or a CIDR range (e.g. 10.0.0.0/24).
          ip: { type: 'string', minLength: 2, maxLength: 49 },
          reason: { type: 'string', maxLength: 300 },
          expiresAt: { type: ['string', 'null'], maxLength: 40 },
        },
      },
    },
  }, async (request, reply) => {
    const { ip, reason = null, expiresAt = null } = request.body;
    if (!ipmatch.isValidBanTarget(ip)) {
      return reply.code(400).send({ error: 'A valid IPv4/IPv6 address or CIDR range (min /8 for IPv4, /32 for IPv6) is required.' });
    }
    // Refuse a target that would lock out the acting admin — exact match or a
    // range that contains their address.
    if (ipmatch.matchesAny(request.ip, [ip])) {
      return reply.code(400).send({ error: 'Refusing to ban the current administrator address or a range that contains it.' });
    }
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
      return reply.code(400).send({ error: 'Ban expiry must be a future timestamp.' });
    }
    try {
      const info = db.prepare(
        'INSERT INTO ip_bans (ip, reason, expires_at, created_by) VALUES (?, ?, ?, ?)'
      ).run(ip, reason, expiresAt, request.user.id);
      auditLog({ user_id: request.user.id, action: 'ip_ban_create', target: ip, detail: reason, ip: request.ip });
      return reply.code(201).send({ ban: db.prepare('SELECT id, ip, reason, expires_at, created_at FROM ip_bans WHERE id = ?').get(info.lastInsertRowid) });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return reply.code(409).send({ error: 'That address is already banned.' });
      throw err;
    }
  });

  fastify.delete('/api/admin/ip-bans/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid ban id.' });
    const ban = db.prepare('SELECT id, ip FROM ip_bans WHERE id = ?').get(id);
    if (!ban) return reply.code(404).send({ error: 'IP ban not found.' });
    db.prepare('DELETE FROM ip_bans WHERE id = ?').run(id);
    auditLog({ user_id: request.user.id, action: 'ip_ban_delete', target: ban.ip, ip: request.ip });
    return { message: 'IP ban removed.' };
  });

  // Safe runtime settings only. Secrets, filesystem paths, and feature gates
  // remain environment-owned and are deliberately absent from this allowlist.
  fastify.get('/api/admin/settings', {
    preHandler: [fastify.authenticate],
  }, async () => ({ settings: settings.listSettings() }));

  fastify.patch('/api/admin/settings', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['settings'],
        additionalProperties: false,
        properties: {
          settings: { type: 'object', minProperties: 1 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const changed = settings.updateSettings(request.body.settings, request.user.id);
      auditLog({
        user_id: request.user.id,
        action: 'settings_update',
        target: 'platform',
        detail: Object.keys(changed).sort().join(', '),
        ip: request.ip,
      });
      return { settings: settings.listSettings(), changed };
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
}

module.exports = adminRoutes;
