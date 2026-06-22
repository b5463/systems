'use strict';

const bcrypt = require('bcrypt');
const { userRepo, adminRepo, auditRepo } = require('../repo');
const ipmatch = require('../util/ipmatch');
const settings = require('../util/settings');

async function adminRoutes(fastify, options) {
  // List all users
  fastify.get('/api/admin/users', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const users = await userRepo.listUsers();
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
    const adminCount = await userRepo.countUsers();
    if (adminCount >= 2) {
      return reply.code(409).send({ error: 'SYSTEMS. allows a maximum of two admins.' });
    }

    const existing = await userRepo.findByUsername(username);
    if (existing) {
      return reply.code(409).send({ error: 'A user with this username already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const info = await userRepo.createUser(username, password_hash);

    await auditRepo.appendAudit({ user_id: request.user.id, action: 'user_create', target: username, ip: request.ip });

    const user = await userRepo.findById(info.lastInsertRowid);
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

    const user = await userRepo.findById(id);
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    await userRepo.deleteUser(id);
    await auditRepo.appendAudit({ user_id: request.user.id, action: 'user_delete', target: user.username, ip: request.ip });

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

    const user = await userRepo.findById(id);
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    const password_hash = await bcrypt.hash(newPassword, 12);
    // Bump token_version so the reset signs out the target user's sessions.
    await userRepo.updatePassword(id, password_hash);

    await auditRepo.appendAudit({ user_id: request.user.id, action: 'password_reset', target: user.username, ip: request.ip });
    return { message: 'Password reset.' };
  });

  // Persistent IP denylist for incident response. This is intentionally
  // operator-managed; login backoff remains the safer automatic response.
  fastify.get('/api/admin/ip-bans', {
    preHandler: [fastify.authenticate],
  }, async () => ({
    bans: await adminRepo.listBans(),
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
      const info = await adminRepo.createBan({ ip, reason, expiresAt, createdBy: request.user.id });
      await auditRepo.appendAudit({ user_id: request.user.id, action: 'ip_ban_create', target: ip, detail: reason, ip: request.ip });
      const ban = await adminRepo.findBanById(info.lastInsertRowid);
      return reply.code(201).send({ ban });
    } catch (err) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'That address is already banned.' });
      throw err;
    }
  });

  fastify.delete('/api/admin/ip-bans/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid ban id.' });
    const ban = await adminRepo.findBanById(id);
    if (!ban) return reply.code(404).send({ error: 'IP ban not found.' });
    await adminRepo.deleteBan(id);
    await auditRepo.appendAudit({ user_id: request.user.id, action: 'ip_ban_delete', target: ban.ip, ip: request.ip });
    return { message: 'IP ban removed.' };
  });

  // Safe runtime settings only. Secrets, filesystem paths, and feature gates
  // remain environment-owned and are deliberately absent from this allowlist.
  fastify.get('/api/admin/settings', {
    preHandler: [fastify.authenticate],
  }, async () => ({ settings: await settings.listSettings() }));

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
      const changed = await settings.updateSettings(request.body.settings, request.user.id);
      await auditRepo.appendAudit({
        user_id: request.user.id,
        action: 'settings_update',
        target: 'platform',
        detail: Object.keys(changed).sort().join(', '),
        ip: request.ip,
      });
      return { settings: await settings.listSettings(), changed };
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
}

module.exports = adminRoutes;
