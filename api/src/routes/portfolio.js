'use strict';

// V4 Phase 5 — Portfolio CMS API (Tomas). Gated per-request: ENABLE_V4_PORTFOLIO
// (already reserved in util/flags.js since Phase 0). Flag off → canonical 404,
// same contract as systems.js (Phase 0.5 namespace rule).
//
// ORG-SCOPING: every repo call is passed the authenticated organisation's id
// — see api/scripts/lint-org-scoping.js and api/src/repo/portfolio.js.
//
// Publish pipeline (validation, snapshot hashing/versioning, size limits,
// concurrent-publish locking) is pure logic in services/portfolioPublish.js
// so it can be unit tested without a database.

const { portfolioRepo, orgRepo, auditV4Repo } = require('../repo');
const { features } = require('../util/flags');
const {
  buildSnapshotContent, canAcquirePublishLock, translationCompleteness,
  SUPPORTED_LOCALES, SCHEMA_VERSION,
} = require('../services/portfolioPublish');

// Single-process in-memory publish lock, keyed by organisationId+locale. Safe
// for the current single-node deployment target; must move to a DB-backed
// publish_locks table (same TTL semantics — see
// portfolioPublish.canAcquirePublishLock) once ENABLE_MULTI_NODE ships, so a
// lock can be observed across nodes.
const publishLocks = new Map();
const PUBLISH_LOCK_TTL_MS = 5 * 60 * 1000;

async function portfolioRoutes(fastify) {
  const currentOrg = () => orgRepo.ensureDefault();

  const portfolioGate = async (request, reply) => {
    if (!features().v4Portfolio) {
      return reply.code(404).send({
        error: 'Not found', code: 'NOT_FOUND', statusCode: 404, requestId: request.id,
      });
    }
  };

  // ---- Pages ----

  fastify.get('/api/portfolio/pages', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request) => {
    const org = await currentOrg();
    const pages = await portfolioRepo.listPages(org.id, request.query.locale);
    return { pages };
  });

  fastify.put('/api/portfolio/pages', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const body = request.body || {};
    if (!body.slug || !body.title || !body.locale) {
      return reply.code(400).send({ error: 'slug, title, and locale are required' });
    }
    const page = await portfolioRepo.upsertPage(org.id, body);
    if (!page) return reply.code(404).send({ error: 'Page not found' });
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: request.user.id, action: 'portfolio_page_save',
      entity_type: 'portfolio_page', entity_id: page.id, detail: body.slug, ip: request.ip,
    });
    return { page };
  });

  // ---- Product profiles ----

  fastify.get('/api/portfolio/profiles', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request) => {
    const org = await currentOrg();
    const profiles = await portfolioRepo.listProfiles(org.id, request.query.locale);
    return { profiles };
  });

  fastify.put('/api/portfolio/profiles', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const body = request.body || {};
    if (!body.productId || !body.title || !body.locale) {
      return reply.code(400).send({ error: 'productId, title, and locale are required' });
    }
    const profile = await portfolioRepo.upsertProfile(org.id, body);
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: request.user.id, action: 'portfolio_profile_save',
      entity_type: 'portfolio_profile', entity_id: profile.id, detail: body.productId, ip: request.ip,
    });
    return { profile };
  });

  // ---- Blocks ----

  fastify.get('/api/portfolio/blocks', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const { ownerType, ownerId, locale } = request.query;
    if (!ownerType || !ownerId) return reply.code(400).send({ error: 'ownerType and ownerId are required' });
    const blocks = await portfolioRepo.listBlocks(org.id, ownerType, ownerId, locale);
    return { blocks: blocks.map((b) => ({ ...b, data: JSON.parse(b.data) })) };
  });

  fastify.put('/api/portfolio/blocks', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const body = request.body || {};
    if (!body.ownerType || !body.ownerId || !body.blockType) {
      return reply.code(400).send({ error: 'ownerType, ownerId, and blockType are required' });
    }
    const block = await portfolioRepo.upsertBlock(org.id, body);
    if (!block) return reply.code(404).send({ error: 'Block not found' });
    return { block: { ...block, data: JSON.parse(block.data) } };
  });

  fastify.delete('/api/portfolio/blocks/:id', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const ok = await portfolioRepo.deleteBlock(org.id, request.params.id);
    if (!ok) return reply.code(404).send({ error: 'Block not found' });
    return { ok: true };
  });

  // ---- Redirects ----

  fastify.get('/api/portfolio/redirects', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request) => {
    const org = await currentOrg();
    const redirects = await portfolioRepo.listRedirects(org.id, request.query.locale);
    return { redirects };
  });

  fastify.post('/api/portfolio/redirects', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const body = request.body || {};
    if (!body.fromPath || !body.toPath || !body.locale) {
      return reply.code(400).send({ error: 'fromPath, toPath, and locale are required' });
    }
    const redirect = await portfolioRepo.createRedirect(org.id, body);
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: request.user.id, action: 'portfolio_redirect_create',
      entity_type: 'portfolio_redirect', entity_id: redirect.id, detail: body.fromPath, ip: request.ip,
    });
    return reply.code(201).send({ redirect });
  });

  fastify.delete('/api/portfolio/redirects/:id', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const ok = await portfolioRepo.deleteRedirect(org.id, request.params.id);
    if (!ok) return reply.code(404).send({ error: 'Redirect not found' });
    return { ok: true };
  });

  // ---- Legal versions ----

  fastify.get('/api/portfolio/legal', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request) => {
    const org = await currentOrg();
    const versions = await portfolioRepo.listLegalVersions(org.id, request.query.locale);
    return { versions };
  });

  fastify.post('/api/portfolio/legal', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const body = request.body || {};
    if (!body.docType || !body.version || !body.locale || !body.effectiveAt) {
      return reply.code(400).send({ error: 'locale, docType, version, and effectiveAt are required' });
    }
    const version = await portfolioRepo.createLegalVersion(org.id, body);
    await auditV4Repo.append({
      organisation_id: org.id, admin_user_id: request.user.id, action: 'portfolio_legal_create',
      entity_type: 'legal_version', entity_id: version.id, detail: `${body.docType}@${body.version}`, ip: request.ip,
    });
    return reply.code(201).send({ version });
  });

  // ---- Media (list only — upload/quarantine pipeline is Alex's Phase 5 task) ----

  fastify.get('/api/portfolio/media', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request) => {
    const org = await currentOrg();
    const media = await portfolioRepo.listMedia(org.id, request.query.status);
    return { media };
  });

  // ---- Locales ----

  fastify.get('/api/portfolio/locales', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async () => {
    const org = await currentOrg();
    const [pages, profiles] = await Promise.all([
      portfolioRepo.listPages(org.id),
      portfolioRepo.listProfiles(org.id),
    ]);
    return {
      supportedLocales: SUPPORTED_LOCALES,
      pages: translationCompleteness(pages, { keyField: 'slug' }),
      profiles: translationCompleteness(profiles, { keyField: 'productId' }),
    };
  });

  // ---- Preview (validate + build snapshot content without persisting) ----

  fastify.post('/api/portfolio/preview', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request, reply) => {
    const org = await currentOrg();
    const locale = (request.body && request.body.locale) || 'en';
    try {
      const { content, hash, sizeBytes } = await buildOrgSnapshot(org.id, locale);
      return { preview: content, hash, sizeBytes };
    } catch (err) {
      return reply.code(422).send({ error: err.message });
    }
  });

  // ---- Publish ----

  fastify.post('/api/portfolio/publish', {
    preHandler: [portfolioGate, fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const locale = (request.body && request.body.locale) || 'en';
    const lockKey = `${org.id}:${locale}`;

    const existingLock = publishLocks.get(lockKey);
    const lockCheck = canAcquirePublishLock(existingLock, Date.now(), PUBLISH_LOCK_TTL_MS);
    if (!lockCheck.allowed) {
      return reply.code(409).send({ error: lockCheck.reason });
    }
    publishLocks.set(lockKey, { lockedAt: new Date(), lockedBy: request.user.id });

    try {
      const { content, hash, sizeBytes } = await buildOrgSnapshot(org.id, locale);
      const snapshot = await portfolioRepo.createSnapshot(org.id, {
        locale, content, contentHash: hash, schemaVersion: SCHEMA_VERSION, publishedBy: request.user.id,
      });

      await auditV4Repo.append({
        organisation_id: org.id, admin_user_id: request.user.id, action: 'portfolio_publish',
        entity_type: 'portfolio_snapshot', entity_id: snapshot.id,
        detail: `v${snapshot.version} · ${sizeBytes}B · ${hash.slice(0, 12)}`, ip: request.ip,
      });

      // Phase 5 (Alex): publish should also serialise this snapshot to S3 and
      // flip the CDN pointer atomically. Not wired here — /api/public/* reads
      // live from PostgreSQL until the S3 publish pipeline exists.
      return reply.code(201).send({
        snapshot: { id: snapshot.id, version: snapshot.version, locale: snapshot.locale, publishedAt: snapshot.publishedAt, sizeBytes },
      });
    } catch (err) {
      return reply.code(422).send({ error: err.message });
    } finally {
      publishLocks.delete(lockKey);
    }
  });

  // ---- Publish history + rollback ----

  fastify.get('/api/portfolio/snapshots', {
    preHandler: [portfolioGate, fastify.authenticate],
  }, async (request) => {
    const org = await currentOrg();
    const snapshots = await portfolioRepo.listSnapshots(org.id, request.query.locale);
    return {
      snapshots: snapshots.map((s) => ({
        id: s.id, version: s.version, locale: s.locale, contentHash: s.contentHash,
        schemaVersion: s.schemaVersion, publishedBy: s.publishedBy, publishedAt: s.publishedAt,
      })),
    };
  });

  fastify.post('/api/portfolio/snapshots/:version/rollback', {
    preHandler: [portfolioGate, fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const org = await currentOrg();
    const locale = (request.body && request.body.locale) || 'en';
    const targetVersion = Number(request.params.version);
    try {
      const snapshot = await portfolioRepo.rollbackToSnapshot(org.id, locale, targetVersion, request.user.id);
      await auditV4Repo.append({
        organisation_id: org.id, admin_user_id: request.user.id, action: 'portfolio_rollback',
        entity_type: 'portfolio_snapshot', entity_id: snapshot.id,
        detail: `rolled back to v${targetVersion}, republished as v${snapshot.version}`, ip: request.ip,
      });
      return reply.code(201).send({ snapshot: { id: snapshot.id, version: snapshot.version, locale: snapshot.locale, publishedAt: snapshot.publishedAt } });
    } catch (err) {
      return reply.code(404).send({ error: err.message });
    }
  });

  // Gather every draft input for one locale and run it through the pure
  // publish-pipeline builder. Shared by /preview and /publish so a preview is
  // always an exact dry run of what publish would produce.
  async function buildOrgSnapshot(organisationId, locale) {
    const [pages, profiles, redirects, legalVersions] = await Promise.all([
      portfolioRepo.listPages(organisationId, locale),
      portfolioRepo.listProfiles(organisationId, locale),
      portfolioRepo.listRedirects(organisationId, locale),
      portfolioRepo.listLegalVersions(organisationId, locale),
    ]);
    const blockLists = await Promise.all(
      pages.map((p) => portfolioRepo.listBlocks(organisationId, 'page', p.id, locale)),
    );
    const blocks = blockLists.flat().map((b) => ({ ...b, data: JSON.parse(b.data) }));
    return buildSnapshotContent({ locale, pages, profiles, blocks, redirects, legalVersions });
  }
}

module.exports = portfolioRoutes;
