'use strict';

const crypto = require('crypto');
const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');
const { projectContainerOptions } = require('../util/limits');
const { loadOr404 } = require('../util/project');

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
    const project = loadOr404(reply, slug);
    if (!project) return;

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
        properties: {
          // Keys to set/overwrite (merged over the existing env).
          vars: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          // Keys to delete from the existing env.
          remove: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const vars = request.body.vars || {};
    const remove = request.body.remove || [];

    const project = loadOr404(reply, slug);
    if (!project) return;
    if (project.status === 'building') return reply.code(409).send({ error: 'Cannot update env while building' });

    if (!project.container_id || !project.image_id) {
      return reply.code(400).send({ error: 'Project has no running container to reconfigure' });
    }

    // Validate keys and values. Values are injected into the container's Env
    // array, so reject control characters and cap the length.
    for (const [key, val] of Object.entries(vars)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        return reply.code(400).send({ error: `Invalid env var key: "${key}"` });
      }
      if (typeof val !== 'string' || /[\n\r\0]/.test(val)) {
        return reply.code(400).send({ error: `Invalid value for "${key}": no line breaks or null bytes.` });
      }
      if (val.length > 8192) {
        return reply.code(400).send({ error: `Value for "${key}" is too long (max 8192 chars).` });
      }
    }

    // Merge over the existing env (so adding one key doesn't wipe the rest);
    // apply deletions. The API never returns values, so a full replace from the
    // UI would be a data-loss trap.
    let merged = {};
    if (project.env_vars) { try { merged = decryptEnvVars(project.env_vars); } catch { merged = {}; } }
    merged = { ...merged, ...vars };
    for (const k of remove) delete merged[k];

    if (!Object.keys(vars).length && !remove.length) {
      return reply.code(400).send({ error: 'Nothing to change.' });
    }

    let encrypted;
    try {
      encrypted = encryptEnvVars(merged);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }

    // Store encrypted vars, and mark building during the recreate so
    // reconciliation (which skips 'building') doesn't race the swap window.
    db.prepare(`UPDATE projects SET env_vars = ?, status = 'building', updated_at = datetime('now') WHERE slug = ?`).run(encrypted, slug);

    // Recreate container with new env vars (stop → remove → recreate → start)
    try {
      if (project.status === 'running') {
        await dockerService.stopContainer(project.container_id);
      }
      await dockerService.removeContainer(project.container_id, true);

      const newContainerId = await dockerService.runContainer(
        slug, project.image_id, project.port, merged, projectContainerOptions(project)
      );

      db.prepare(`
        UPDATE projects SET status = 'running', container_id = ?, updated_at = datetime('now') WHERE slug = ?
      `).run(newContainerId, slug);

      const changed = [...Object.keys(vars), ...remove.map((k) => `-${k}`)];
      auditLog({
        user_id: request.user.id,
        action: 'env_update',
        target: slug,
        detail: `keys: ${changed.join(', ')}`,
        ip: request.ip,
      });

      return { message: 'Env vars updated and container restarted', keys: Object.keys(merged) };
    } catch (err) {
      request.log.error({ err }, '[env] Failed to recreate container with new env vars');
      // The old container was already removed; null the id so reconcile/lifecycle
      // don't act on a removed container. Operator redeploys to recover.
      db.prepare(`UPDATE projects SET status = 'error', container_id = NULL, updated_at = datetime('now') WHERE slug = ?`).run(slug);
      return reply.code(500).send({ error: `Failed to restart container: ${err.message}` });
    }
  });
}

module.exports = envRoutes;
module.exports.decryptEnvVars = decryptEnvVars;
module.exports.encryptEnvVars = encryptEnvVars;
