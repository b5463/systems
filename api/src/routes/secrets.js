'use strict';

const crypto = require('crypto');
const { secretRepo, auditRepo } = require('../repo');
const { features } = require('../util/flags');
const { loadOr404 } = require('../util/project');

function getEncryptionKey() {
  const secret = process.env.ENV_SECRET;
  if (!secret) throw new Error('ENV_SECRET environment variable is not set');
  return crypto.createHash('sha256').update(`secrets:${secret}`).digest();
}

function encrypt(value) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString('hex'), authTag: authTag.toString('hex'), data: encrypted.toString('hex') });
}

function decrypt(encryptedJson) {
  const key = getEncryptionKey();
  const { iv, authTag, data } = JSON.parse(encryptedJson);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}

async function secretsRoutes(fastify) {
  fastify.get('/api/projects/:slug/secrets', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().secretsManagement) return reply.code(404).send({ error: 'Secrets management is not enabled.' });
    const project = await loadOr404(reply, request.params.slug);
    if (!project) return;
    const secrets = await secretRepo.listByProject(project.id);
    return {
      secrets: secrets.map((s) => ({
        key: s.key, version: s.version,
        rotatedAt: s.rotated_at, createdAt: s.created_at,
      })),
    };
  });

  fastify.put('/api/projects/:slug/secrets', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['key', 'value'],
        properties: {
          key: { type: 'string', minLength: 1, maxLength: 256, pattern: '^[A-Za-z_][A-Za-z0-9_]*$' },
          value: { type: 'string', minLength: 1, maxLength: 65536 },
        },
      },
    },
  }, async (request, reply) => {
    if (!features().secretsManagement) return reply.code(404).send({ error: 'Secrets management is not enabled.' });
    const project = await loadOr404(reply, request.params.slug);
    if (!project) return;
    const { key, value } = request.body;
    const encrypted = encrypt(value);
    const secret = await secretRepo.upsert(project.id, key, encrypted);
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'secret_set', target: `${request.params.slug}/${key}`,
      detail: `v${secret.version}`, ip: request.ip,
    });
    return { key: secret.key, version: secret.version };
  });

  fastify.post('/api/projects/:slug/secrets/:key/rotate', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['value'],
        properties: { value: { type: 'string', minLength: 1, maxLength: 65536 } },
      },
    },
  }, async (request, reply) => {
    if (!features().secretsManagement) return reply.code(404).send({ error: 'Secrets management is not enabled.' });
    const project = await loadOr404(reply, request.params.slug);
    if (!project) return;
    const { key } = request.params;
    const existing = await secretRepo.findByProjectAndKey(project.id, key);
    if (!existing) return reply.code(404).send({ error: 'Secret not found.' });
    const encrypted = encrypt(request.body.value);
    const updated = await secretRepo.upsert(project.id, key, encrypted);
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'secret_rotated', target: `${request.params.slug}/${key}`,
      detail: `v${existing.version} → v${updated.version}`, ip: request.ip,
    });
    return { key: updated.key, version: updated.version, rotatedAt: updated.rotated_at };
  });

  fastify.delete('/api/projects/:slug/secrets/:key', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().secretsManagement) return reply.code(404).send({ error: 'Secrets management is not enabled.' });
    const project = await loadOr404(reply, request.params.slug);
    if (!project) return;
    const { key } = request.params;
    await secretRepo.remove(project.id, key);
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'secret_deleted', target: `${request.params.slug}/${key}`, ip: request.ip,
    });
    return { message: 'Secret deleted.' };
  });
}

module.exports = secretsRoutes;
module.exports.encrypt = encrypt;
module.exports.decrypt = decrypt;
