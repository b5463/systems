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

const { domainRepo, systemRepo, orgRepo, auditV4Repo, maintenanceRepo } = require('../repo');
const { features } = require('../util/flags');
const domainrouting = require('../services/domainrouting');

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
    // Issue a verification token + DNS instructions immediately so the UI can
    // show the operator the exact TXT record to add.
    const v = domainrouting.generateVerification(hostname);
    await domainRepo.setVerification(org.id, domain.id, { token: v.token, method: v.method, expiresAt: v.expiresAt });
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: null, action: 'domain_created',
      entity_type: 'domain', entity_id: domain.id, detail: hostname, ip: request.ip,
    });
    return reply.code(201).send({
      domain,
      verification: {
        status: 'pending',
        method: v.method,
        record: v.record,
        expiresAt: v.expiresAt,
        note: `Add this DNS TXT record, then POST /api/systems/${system.id}/domains/${domain.id}/verify to check it.`,
      },
    });
  });

  // Re-issue verification instructions for a pending domain (e.g. after the
  // token expired). Returns the DNS record to add.
  fastify.post('/api/systems/:id/domains/:domainId/verify/start', {
    preHandler: [domainsGate, fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const domain = await domainRepo.findById(org.id, request.params.domainId);
    if (!domain || domain.systemId !== request.params.id) return reply.code(404).send({ error: 'Domain not found' });
    if (!domain.isCustom) return reply.code(400).send({ error: 'The default subdomain does not require verification' });
    const v = domainrouting.generateVerification(domain.hostname);
    await domainRepo.setVerification(org.id, domain.id, { token: v.token, method: v.method, expiresAt: v.expiresAt });
    return { status: 'pending', method: v.method, record: v.record, expiresAt: v.expiresAt };
  });

  // Check DNS ownership. Marks the domain verified on success; records the
  // reason (and stays unverified) on failure. Never 500s on a DNS miss.
  fastify.post('/api/systems/:id/domains/:domainId/verify', {
    preHandler: [domainsGate, fastify.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const domain = await domainRepo.findById(org.id, request.params.domainId);
    if (!domain || domain.systemId !== request.params.id) return reply.code(404).send({ error: 'Domain not found' });
    if (domain.verified) return { verified: true, alreadyVerified: true };

    const result = await domainrouting.checkDnsVerification({
      hostname: domain.hostname,
      token: domain.verificationToken,
      expiresAt: domain.verificationExpiresAt,
      resolveTxt: domainrouting.resolveTxt,
    });
    if (result.verified) {
      await domainRepo.markVerified(org.id, domain.id);
      await auditV4Repo.append({
        organisation_id: org.id, admin_user_id: null, action: 'domain_verified',
        entity_type: 'domain', entity_id: domain.id, detail: domain.hostname, ip: request.ip,
      });
      return { verified: true };
    }
    await domainRepo.markVerificationFailed(org.id, domain.id, result.reason);
    return reply.code(409).send({ verified: false, reason: result.reason });
  });

  // Designate the canonical hostname for a system (others redirect to it).
  fastify.post('/api/systems/:id/domains/:domainId/canonical', {
    preHandler: [domainsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const domain = await domainRepo.findById(org.id, request.params.domainId);
    if (!domain || domain.systemId !== request.params.id) return reply.code(404).send({ error: 'Domain not found' });
    if (domain.isCustom && !domain.verified) {
      return reply.code(409).send({ error: 'Verify the domain before making it canonical' });
    }
    await domainRepo.setCanonical(org.id, domain.systemId, domain.id);
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: null, action: 'domain_canonical_set',
      entity_type: 'domain', entity_id: domain.id, detail: domain.hostname, ip: request.ip,
    });
    return { ok: true, canonical: domain.hostname };
  });

  // ── Maintenance windows ────────────────────────────────────────────────
  fastify.get('/api/systems/:id/maintenance', {
    preHandler: [domainsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.findById(org.id, request.params.id).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });
    return { windows: await maintenanceRepo.listBySystem(org.id, system.id) };
  });

  fastify.post('/api/systems/:id/maintenance', {
    preHandler: [domainsGate, fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['startsAt', 'endsAt'],
        properties: {
          environmentId: { type: 'string' },
          message: { type: 'string', maxLength: 500 },
          startsAt: { type: 'string' },
          endsAt: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const org = await currentOrg();
    const system = await systemRepo.findById(org.id, request.params.id).catch(() => null);
    if (!system) return reply.code(404).send({ error: 'System not found' });
    const startsAt = new Date(request.body.startsAt);
    const endsAt = new Date(request.body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return reply.code(400).send({ error: 'startsAt and endsAt must be valid timestamps' });
    }
    if (endsAt <= startsAt) return reply.code(400).send({ error: 'endsAt must be after startsAt' });
    const win = await maintenanceRepo.create(org.id, {
      systemId: system.id,
      environmentId: request.body.environmentId || null,
      message: request.body.message || undefined,
      startsAt, endsAt, createdBy: null,
    });
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: null, action: 'maintenance_scheduled',
      entity_type: 'system', entity_id: system.id, detail: `${startsAt.toISOString()}..${endsAt.toISOString()}`, ip: request.ip,
    });
    return reply.code(201).send({ window: win });
  });

  fastify.delete('/api/systems/:id/maintenance/:windowId', {
    preHandler: [domainsGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const win = await maintenanceRepo.findById(org.id, request.params.windowId);
    if (!win || win.systemId !== request.params.id) return reply.code(404).send({ error: 'Maintenance window not found' });
    await maintenanceRepo.remove(org.id, win.id);
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: null, action: 'maintenance_cancelled',
      entity_type: 'system', entity_id: win.systemId, detail: win.id, ip: request.ip,
    });
    return { ok: true };
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
      organisation_id: org.id, admin_user_id: null, action: 'domain_removed',
      entity_type: 'domain', entity_id: domain.id, detail: domain.hostname, ip: request.ip,
    });
    return { ok: true };
  });
}

module.exports = domainsRoutes;
