'use strict';

// V4 Phase 2 — Systems and Products APIs (read + write), admin auth class.
//
// Gated per-request: ENABLE_V4_SYSTEMS for /api/systems, ENABLE_V4_PRODUCTS
// for /api/products. Flag off → canonical 404, exactly as if the namespace
// did not exist (Phase 0.5 namespace contract).
//
// ORG-SCOPING: handlers resolve the authenticated organisation and pass its
// id into the repos; ids arriving in URLs are looked up only WITHIN that
// organisation. Cross-org reads must 404.

const { systemRepo, productRepo, orgRepo, auditV4Repo } = require('../repo');
const { features } = require('../util/flags');

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

async function systemsRoutes(fastify, options) {
  // Single-tenant today: the authenticated admin acts within the default
  // organisation. Resolved per request (idempotent upsert) so it is always
  // correct, including under test resets. Multi-org auth lands in Phase 7.5.
  const currentOrg = () => orgRepo.ensureDefault();

  const gate = (flagKey) => async (request, reply) => {
    if (!features()[flagKey]) {
      return reply.code(404).send({
        error: 'Not found', code: 'NOT_FOUND', statusCode: 404, requestId: request.id,
      });
    }
  };
  const systemsGate = gate('v4Systems');
  const productsGate = gate('v4Products');

  // ── Systems (read) ─────────────────────────────────────────────────────────

  fastify.get('/api/systems', {
    preHandler: [systemsGate, fastify.authenticate],
  }, async () => {
    const org = await currentOrg();
    return { systems: await systemRepo.list(org.id) };
  });

  fastify.get('/api/systems/:id', {
    preHandler: [systemsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.findById(org.id, request.params.id).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });
    return { system };
  });

  fastify.get('/api/systems/:id/environments', {
    preHandler: [systemsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.findById(org.id, request.params.id).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });
    return { environments: await systemRepo.listEnvironments(org.id, system.id) };
  });

  fastify.get('/api/systems/:id/releases', {
    preHandler: [systemsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.findById(org.id, request.params.id).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });
    return { releases: await systemRepo.listReleases(org.id, system.id) };
  });

  // ── Systems (write) ────────────────────────────────────────────────────────

  fastify.post('/api/systems', {
    preHandler: [systemsGate, fastify.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const { name, slug, productId, systemType, repo, deployBranch, isPrimaryRoot, runtime } = request.body || {};
    if (!name || !slug) return reply.code(400).send({ error: 'name and slug are required' });
    if (!SLUG_RE.test(slug)) return reply.code(400).send({ error: 'Invalid slug' });
    if (await systemRepo.findBySlug(org.id, slug)) {
      return reply.code(409).send({ error: 'A system with this slug already exists' });
    }
    const system = await systemRepo.create(org.id, {
      name, slug, productId, systemType, repo, deployBranch, isPrimaryRoot, runtime,
    });
    await auditV4Repo.append({
      organisation_id: org.id, action: 'system_created',
      entity_type: 'system', entity_id: system.id, detail: slug, ip: request.ip,
    });
    return reply.code(201).send({ system });
  });

  fastify.patch('/api/systems/:id', {
    preHandler: [systemsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.update(org.id, request.params.id, request.body || {}).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });
    await auditV4Repo.append({
      organisation_id: org.id, action: 'system_updated',
      entity_type: 'system', entity_id: system.id, detail: Object.keys(request.body || {}).join(','), ip: request.ip,
    });
    return { system };
  });

  // ── Products ───────────────────────────────────────────────────────────────

  fastify.get('/api/products', {
    preHandler: [productsGate, fastify.authenticate],
  }, async () => {
    const org = await currentOrg();
    return { products: await productRepo.list(org.id) };
  });

  fastify.get('/api/products/:id', {
    preHandler: [productsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const product = await productRepo.findById(org.id, request.params.id).catch(() => null);
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return { product };
  });

  fastify.post('/api/products', {
    preHandler: [productsGate, fastify.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const { name, slug, status, description } = request.body || {};
    if (!name || !slug) return reply.code(400).send({ error: 'name and slug are required' });
    if (!SLUG_RE.test(slug)) return reply.code(400).send({ error: 'Invalid slug' });
    if (await productRepo.findBySlug(org.id, slug)) {
      return reply.code(409).send({ error: 'A product with this slug already exists' });
    }
    const product = await productRepo.create(org.id, { name, slug, status, description });
    await auditV4Repo.append({
      organisation_id: org.id, action: 'product_created',
      entity_type: 'product', entity_id: product.id, detail: slug, ip: request.ip,
    });
    return reply.code(201).send({ product });
  });

  fastify.patch('/api/products/:id', {
    preHandler: [productsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const product = await productRepo.update(org.id, request.params.id, request.body || {}).catch(() => null);
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    await auditV4Repo.append({
      organisation_id: org.id, action: 'product_updated',
      entity_type: 'product', entity_id: product.id, detail: Object.keys(request.body || {}).join(','), ip: request.ip,
    });
    return { product };
  });
}

module.exports = systemsRoutes;
