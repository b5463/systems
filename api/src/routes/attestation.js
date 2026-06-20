'use strict';

const crypto = require('crypto');
const { db } = require('../db');
const attestation = require('../util/attestation');

async function attestationRoutes(fastify) {
  fastify.get('/api/internal/attestation/:slug', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      params: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' } } },
      querystring: { type: 'object', required: ['nonce'], properties: { nonce: { type: 'string', minLength: 22, maxLength: 64 } } },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { nonce } = request.query;
    const credential = request.headers['x-systems-route-credential'];
    if (!attestation.validNonce(nonce) || !attestation.validCredential(slug, credential)) {
      return reply.code(404).send({ error: 'Not found' });
    }
    const project = db.prepare(
      `SELECT slug, image_id, status, deploy_type, health_state, health_status, health_checked_at
       FROM projects WHERE slug = ? AND status != 'deleted'`
    ).get(slug);
    if (!project) return reply.code(404).send({ error: 'Not found' });

    const issuedAt = Date.now();
    const fingerprint = project.image_id
      ? crypto.createHash('sha256').update(project.image_id).digest('base64url').slice(0, 22)
      : null;
    const payload = {
      v: 1,
      slug,
      nonce,
      issuedAt,
      expiresAt: issuedAt + attestation.MAX_AGE_MS,
      deployment: { fingerprint, type: project.deploy_type || null },
      observed: {
        runtime: project.status,
        health: project.health_state || 'not_measured',
        httpStatus: project.health_status || null,
        checkedAt: project.health_checked_at || null,
      },
    };
    reply.header('Cache-Control', 'no-store');
    reply.header('Content-Type', 'application/systems-attestation+json');
    return attestation.seal(payload);
  });
}

module.exports = attestationRoutes;
