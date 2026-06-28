'use strict';

const crypto = require('crypto');
const { tokenRepo, auditRepo } = require('../repo');
const { features } = require('../util/flags');

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateToken() {
  const raw = `sys_${crypto.randomBytes(32).toString('hex')}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashToken(raw) };
}

const VALID_SCOPES = ['deploy', 'read', 'secrets', 'admin'];

async function tokenRoutes(fastify) {
  fastify.post('/api/auth/tokens', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['name', 'scopes'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          scopes: { type: 'array', items: { type: 'string', enum: VALID_SCOPES }, minItems: 1 },
          expiresInDays: { type: 'integer', minimum: 1, maximum: 365 },
        },
      },
    },
  }, async (request, reply) => {
    if (!features().apiTokens) return reply.code(404).send({ error: 'API tokens are not enabled.' });
    const { name, scopes, expiresInDays } = request.body;
    const { raw, prefix, hash } = generateToken();
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null;
    const token = await tokenRepo.create({
      userId: request.user.id, name, tokenHash: hash, prefix, scopes, expiresAt,
    });
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'token_created', target: name,
      detail: `scopes: ${scopes.join(',')}`, ip: request.ip,
    });
    return { token: raw, prefix: token.prefix, name: token.name, scopes, expiresAt: token.expires_at };
  });

  fastify.get('/api/auth/tokens', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().apiTokens) return reply.code(404).send({ error: 'API tokens are not enabled.' });
    const tokens = await tokenRepo.listByUser(request.user.id);
    return {
      tokens: tokens.map((t) => ({
        id: t.id, name: t.name, prefix: t.prefix,
        scopes: JSON.parse(t.scopes),
        lastUsedAt: t.last_used_at, expiresAt: t.expires_at, createdAt: t.created_at,
      })),
    };
  });

  fastify.delete('/api/auth/tokens/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().apiTokens) return reply.code(404).send({ error: 'API tokens are not enabled.' });
    const id = Number(request.params.id);
    const deleted = await tokenRepo.deleteById(id, request.user.id);
    if (!deleted) return reply.code(404).send({ error: 'Token not found.' });
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'token_deleted', detail: `id:${id}`, ip: request.ip,
    });
    return { message: 'Token revoked.' };
  });
}

module.exports = tokenRoutes;
module.exports.hashToken = hashToken;
module.exports.VALID_SCOPES = VALID_SCOPES;
