'use strict';

const { nodeRepo, projectRepo, auditRepo } = require('../repo');
const { features } = require('../util/flags');

async function nodeRoutes(fastify) {
  fastify.get('/api/nodes', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().multiNode) return reply.code(404).send({ error: 'Multi-node is not enabled.' });
    const nodes = await nodeRepo.listAll();
    const result = [];
    for (const n of nodes) {
      const count = await nodeRepo.countProjectsOnNode(n.id);
      result.push({ ...n, projectCount: count });
    }
    return { nodes: result };
  });

  fastify.post('/api/nodes', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['name', 'endpoint'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z0-9][a-z0-9-]*$' },
          endpoint: { type: 'string', minLength: 1, maxLength: 500 },
          role: { type: 'string', enum: ['controller', 'worker'] },
          capacity: {
            type: 'object',
            properties: {
              maxContainers: { type: 'integer', minimum: 1 },
              maxMemoryMb: { type: 'integer', minimum: 256 },
              maxCpuCores: { type: 'number', minimum: 0.5 },
            },
          },
          metadata: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    if (!features().multiNode) return reply.code(404).send({ error: 'Multi-node is not enabled.' });
    const { name, endpoint, role, capacity, metadata } = request.body;
    const existing = await nodeRepo.findByName(name);
    if (existing) return reply.code(409).send({ error: 'A node with this name already exists.' });
    const node = await nodeRepo.create({ name, endpoint, role, capacity, metadata });
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'node_added', target: name,
      detail: `${role || 'worker'} ${endpoint}`, ip: request.ip,
    });
    return { node };
  });

  fastify.put('/api/nodes/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', maxLength: 500 },
          role: { type: 'string', enum: ['controller', 'worker'] },
          capacity: { type: 'object' },
          metadata: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    if (!features().multiNode) return reply.code(404).send({ error: 'Multi-node is not enabled.' });
    const id = Number(request.params.id);
    const node = await nodeRepo.findById(id);
    if (!node) return reply.code(404).send({ error: 'Node not found.' });
    await nodeRepo.updateNode(id, request.body);
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'node_updated', target: node.name, ip: request.ip,
    });
    return { message: 'Node updated.' };
  });

  fastify.delete('/api/nodes/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().multiNode) return reply.code(404).send({ error: 'Multi-node is not enabled.' });
    const id = Number(request.params.id);
    const node = await nodeRepo.findById(id);
    if (!node) return reply.code(404).send({ error: 'Node not found.' });
    await nodeRepo.remove(id);
    await auditRepo.appendAudit({
      user_id: request.user.id, action: 'node_removed', target: node.name, ip: request.ip,
    });
    return { message: 'Node removed.' };
  });

  fastify.get('/api/nodes/:id/health', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().multiNode) return reply.code(404).send({ error: 'Multi-node is not enabled.' });
    const id = Number(request.params.id);
    const node = await nodeRepo.findById(id);
    if (!node) return reply.code(404).send({ error: 'Node not found.' });
    const result = await checkNodeHealth(node);
    await nodeRepo.updateHealth(id, result.status);
    return { node: node.name, ...result };
  });
}

async function checkNodeHealth(node) {
  try {
    const url = `${node.endpoint.replace(/\/$/, '')}/_ping`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return { status: res.ok ? 'healthy' : 'degraded', httpStatus: res.status };
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}

module.exports = nodeRoutes;
module.exports.checkNodeHealth = checkNodeHealth;
