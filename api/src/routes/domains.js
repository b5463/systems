'use strict';

// V4 Phase 4 — Domain read/write API (Tomas's slice of Phase 4). Gated behind
// ENABLE_V4_SYSTEMS (domains hang off systems; no separate flag reserved for
// them). Flag off → canonical 404, same contract as systems.js.
//
// This is deliberately partial: it lets an admin see and register domains,
// but does NOT verify DNS ownership or publish a Caddy route. Those are
// Alex's remaining Phase 4 tasks (custom domain verification flow,
// Domain-driven renderRoute(), route publication transaction). Registering a
// custom domain here creates an unverified row and nothing else — see
// repo/domains.js for the exact boundary.

const { domainRepo, systemRepo, orgRepo, auditV4Repo } = require('../repo');
const { features } = require('../util/flags');

// RFC 1123 hostname: labels of letters/digits/hyphens, no leading/trailing
// hyphen per label, at least one dot (reject bare labels/localhost).
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

async function domainsRoutes(fastify) {
  const currentOrg = () => orgRepo.ensureDefault();

  const domainsGate = async (request, reply) => {
    if (!features().v4Systems) {
      return reply.code(404).send({
        error: 'Not found', code: 'NOT_FOUND', statusCode: 404, requestId: request.id,
      });
    }
  };

  fastify.get('/api/systems/:id/domains', {
    preHandler: [domainsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.findById(org.id, request.params.id).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });
    const domains = await domainRepo.listBySystem(org.id, system.id);
    return { domains };
  });

  fastify.post('/api/systems/:id/domains', {
    preHandler: [domainsGate, fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.findById(org.id, request.params.id).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });

    const hostname = String((request.body && request.body.hostname) || '').trim().toLowerCase();
    if (!HOSTNAME_RE.test(hostname)) {
      return reply.code(400).send({ error: 'Invalid hostname' });
    }
    const existing = await domainRepo.findByHostname(hostname);
    if (existing) return reply.code(409).send({ error: 'This hostname is already registered' });

    const domain = await domainRepo.createCustom(org.id, { systemId: system.id, hostname });
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: request.user.id, action: 'domain_created',
      entity_type: 'domain', entity_id: domain.id, detail: hostname, ip: request.ip,
    });
    return reply.code(201).send({
      domain,
      // Alex's Phase 4 verification flow is not wired yet — this describes
      // what it will require so the UI can show real instructions today.
      verification: {
        status: 'pending_backend',
        note: 'DNS verification is not implemented yet. This domain is registered but unverified and no route will be published until Phase 4 ships the verification flow.',
      },
    });
  });

  fastify.delete('/api/domains/:id', {
    preHandler: [domainsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const domain = await domainRepo.findById(org.id, request.params.id);
    if (!domain) return reply.code(404).send({ error: 'Domain not found' });
    if (!domain.isCustom) return reply.code(400).send({ error: 'Cannot remove the default subdomain' });
    await domainRepo.remove(org.id, domain.id);
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: request.user.id, action: 'domain_removed',
      entity_type: 'domain', entity_id: domain.id, detail: domain.hostname, ip: request.ip,
    });
    return { ok: true };
  });
}

module.exports = domainsRoutes;
