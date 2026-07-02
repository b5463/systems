'use strict';

// V4 Phase 3 — deployment routes on Systems/Environments (admin auth class,
// gated by ENABLE_V4_SYSTEMS like the rest of /api/systems). Execution flows
// through deployservice into the same pipeline the legacy routes use, so both
// generations return the same contracts for the same input.

const { orgRepo } = require('../repo');
const { features } = require('../util/flags');
const deployservice = require('../services/deployservice');
const dockerService = require('../services/docker');

const ENV_RE = /^(production|preview)$/;

async function systemDeployRoutes(fastify, options) {
  const currentOrg = () => orgRepo.ensureDefault();

  const gate = async (request, reply) => {
    if (!features().v4Systems) {
      return reply.code(404).send({
        error: 'Not found', code: 'NOT_FOUND', statusCode: 404, requestId: request.id,
      });
    }
    if (!ENV_RE.test(request.params.env || 'production')) {
      return reply.code(400).send({ error: 'Unknown environment (production|preview)' });
    }
  };

  fastify.post('/api/systems/:id/environments/:env/deploy', {
    preHandler: [gate, fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { readUploadToTmp } = require('./deploy');
    const org = await currentOrg();
    const up = await readUploadToTmp(request);
    if (!up.file) return reply.code(400).send({ error: 'Missing file upload' });
    if (up.tooLarge) return reply.code(413).send({ error: 'ZIP exceeds the upload limit' });

    const result = await deployservice.deployToEnvironment({
      organisationId: org.id, systemId: request.params.id, envName: request.params.env,
      zipPath: up.zipPath, userId: request.user.id, ip: request.ip,
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return reply.code(202).send(result);
  });

  // Redeploy is deploy-to-existing; same handler shape, kept as its own verb
  // to match the legacy contract (`POST /api/deploy/:slug/redeploy`).
  fastify.post('/api/systems/:id/environments/:env/redeploy', {
    preHandler: [gate, fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { readUploadToTmp } = require('./deploy');
    const org = await currentOrg();
    const up = await readUploadToTmp(request);
    if (!up.file) return reply.code(400).send({ error: 'Missing file upload' });
    if (up.tooLarge) return reply.code(413).send({ error: 'ZIP exceeds the upload limit' });

    const target = await deployservice.resolveTarget(org.id, request.params.id, request.params.env);
    if (target.error) return reply.code(target.error.code).send({ error: target.error.message });
    if (!target.project) return reply.code(409).send({ error: 'Environment has no deployments yet — use deploy' });

    const result = await deployservice.deployToEnvironment({
      organisationId: org.id, systemId: request.params.id, envName: request.params.env,
      zipPath: up.zipPath, userId: request.user.id, ip: request.ip,
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return reply.code(202).send(result);
  });

  fastify.post('/api/systems/:id/environments/:env/rollback', {
    preHandler: [gate, fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const result = await deployservice.rollbackEnvironment({
      organisationId: org.id, systemId: request.params.id, envName: request.params.env,
      userId: request.user.id, ip: request.ip, log: request.log,
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return { project: result.project };
  });

  fastify.get('/api/systems/:id/environments/:env/logs', {
    preHandler: [gate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const target = await deployservice.resolveTarget(org.id, request.params.id, request.params.env);
    if (target.error) return reply.code(target.error.code).send({ error: target.error.message });
    const containerId = target.environment.currentRelease?.containerId
      || target.project?.containerId;
    if (!containerId) return reply.code(409).send({ error: 'Environment has no running release' });
    const tail = Math.min(Number(request.query.tail) || 100, 1000);
    try {
      const logs = await dockerService.getContainerLogs(containerId, tail);
      return { logs };
    } catch (err) {
      return reply.code(503).send({ error: `Logs unavailable: ${err.message}` });
    }
  });

  fastify.get('/api/systems/:id/environments/:env/stats', {
    preHandler: [gate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const target = await deployservice.resolveTarget(org.id, request.params.id, request.params.env);
    if (target.error) return reply.code(target.error.code).send({ error: target.error.message });
    const containerId = target.environment.currentRelease?.containerId
      || target.project?.containerId;
    if (!containerId) return reply.code(409).send({ error: 'Environment has no running release' });
    try {
      const stats = await dockerService.getContainerStats(containerId);
      return { stats };
    } catch (err) {
      return reply.code(503).send({ error: `Stats unavailable: ${err.message}` });
    }
  });

  fastify.post('/api/systems/:id/promote', {
    preHandler: [async (request, reply) => {
      if (!features().v4Systems) {
        return reply.code(404).send({
          error: 'Not found', code: 'NOT_FOUND', statusCode: 404, requestId: request.id,
        });
      }
    }, fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const result = await deployservice.promote({
      organisationId: org.id, systemId: request.params.id,
      userId: request.user.id, ip: request.ip,
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return { release: result.release, ...(result.warning ? { warning: result.warning } : {}) };
  });
}

module.exports = systemDeployRoutes;
