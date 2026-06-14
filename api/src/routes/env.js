'use strict';

const crypto = require('crypto');
const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');

function getEncryptionKey() {
  const secret = process.env.ENV_SECRET;
  if (!secret) throw new Error('ENV_SECRET environment variable is not set');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptEnvVars(vars) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(vars);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted.toString('hex'),
  });
}

function decryptEnvVars(encryptedJson) {
  const key = getEncryptionKey();
  const { iv, authTag, data } = JSON.parse(encryptedJson);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function envRoutes(fastify, options) {
  // Returns only key names — never values — for display
  fastify.get('/api/projects/:slug/env', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT env_vars FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    if (!project.env_vars) return { keys: [] };

    try {
      const vars = decryptEnvVars(project.env_vars);
      return { keys: Object.keys(vars) };
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to decrypt env vars' });
    }
  });

  // Set env vars — encrypts and stores, then recreates the container with new vars
  fastify.put('/api/projects/:slug/env', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['vars'],
        properties: {
          vars: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { vars } = request.body;

    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (project.status === 'building') return reply.code(409).send({ error: 'Cannot update env while building' });

    if (!project.container_id || !project.image_id) {
      return reply.code(400).send({ error: 'Project has no running container to reconfigure' });
    }

    // Validate key names
    for (const key of Object.keys(vars)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        return reply.code(400).send({ error: `Invalid env var key: "${key}"` });
      }
    }

    let encrypted;
    try {
      encrypted = encryptEnvVars(vars);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }

    // Store encrypted vars
    db.prepare(`UPDATE projects SET env_vars = ?, updated_at = datetime('now') WHERE slug = ?`).run(encrypted, slug);

    // Recreate container with new env vars (stop → remove → recreate → start)
    try {
      if (project.status === 'running') {
        await dockerService.stopContainer(project.container_id);
      }
      await dockerService.removeContainer(project.container_id, true);

      const newContainerId = await dockerService.runContainer(slug, project.image_id, project.port, vars);

      db.prepare(`
        UPDATE projects SET status = 'running', container_id = ?, updated_at = datetime('now') WHERE slug = ?
      `).run(newContainerId, slug);

      auditLog({
        user_id: request.user.id,
        action: 'env_update',
        target: slug,
        detail: `keys: ${Object.keys(vars).join(', ')}`,
        ip: request.ip,
      });

      return { message: 'Env vars updated and container restarted', keys: Object.keys(vars) };
    } catch (err) {
      request.log.error({ err }, '[env] Failed to recreate container with new env vars');
      db.prepare(`UPDATE projects SET status = 'error', updated_at = datetime('now') WHERE slug = ?`).run(slug);
      return reply.code(500).send({ error: `Failed to restart container: ${err.message}` });
    }
  });
}

module.exports = envRoutes;
module.exports.decryptEnvVars = decryptEnvVars;
module.exports.encryptEnvVars = encryptEnvVars;
