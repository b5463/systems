'use strict';

const { projectRepo, auditRepo } = require('../repo');
const { listRuntimes } = require('../services/buildpipeline');
const { loadOr404 } = require('../util/project');

async function buildPipelineRoutes(fastify) {
  fastify.get('/api/runtimes', {
    preHandler: [fastify.authenticate],
  }, async () => {
    return { runtimes: listRuntimes() };
  });

  fastify.put('/api/projects/:slug/runtime', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['runtime'],
        properties: {
          runtime: { type: 'string', maxLength: 50 },
        },
      },
    },
  }, async (request, reply) => {
    const project = await loadOr404(reply, request.params.slug);
    if (!project) return;
    const validIds = listRuntimes().map((r) => r.id);
    if (!validIds.includes(request.body.runtime)) {
      return reply.code(400).send({ error: `Invalid runtime. Valid options: ${validIds.join(', ')}` });
    }
    await projectRepo.updateRuntime(request.params.slug, request.body.runtime);
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'runtime_changed',
      target: request.params.slug, detail: request.body.runtime, ip: request.ip,
    });
    return { message: 'Runtime updated.', runtime: request.body.runtime };
  });

  fastify.get('/api/backups', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const { backupRepo } = require('../repo');
    const records = await backupRepo.listAll();
    return { backups: records };
  });

  fastify.post('/api/backups/restore-drill', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 2, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const { backupRepo } = require('../repo');
    const records = await backupRepo.listAll(1);
    if (!records.length) return reply.code(404).send({ error: 'No backups found.' });
    const latest = records[0];
    const result = { stamp: latest.stamp, backend: latest.backend, location: latest.location };

    if (latest.backend === 'local') {
      const fsp = require('fs/promises');
      const path = require('path');
      try {
        const dumpPath = path.join(latest.location, 'platform.pgdump');
        await fsp.access(dumpPath);
        result.dumpAccessible = true;
        result.status = 'ready';
      } catch {
        result.dumpAccessible = false;
        result.status = 'missing';
      }
    } else {
      result.status = 'remote';
      result.instruction = `Restore from ${latest.location} using pg_restore --format=custom`;
    }

    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'restore_drill',
      detail: `${latest.stamp} ${result.status}`, ip: request.ip,
    });
    return { drill: result };
  });
}

module.exports = buildPipelineRoutes;
