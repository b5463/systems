'use strict';

// V4 Phase 5 (Alex) — public catalog API for the Acronym site.
//
// Everything here is UNAUTHENTICATED and public-safe. It is served from
// immutable, versioned portfolio SNAPSHOTS (never the live draft tables), so a
// draft edit can't change the public site and a read is a single indexed lookup
// of a published blob, not a query over live CMS content. Every response goes
// through the public DTO allowlist (services/publicCatalog.js).
//
// Caching: strong ETag from the snapshot content hash + Cache-Control with
// stale-while-revalidate, so a CDN/renderer can serve last-known-good even
// during a SYSTEMS. API outage. Gated behind ENABLE_V4_PORTFOLIO (flag off →
// canonical 404, same namespace contract as the rest of V4).

const { orgRepo, portfolioRepo, auditV4Repo } = require('../repo');
const { features } = require('../util/flags');
const { toPublicCatalog } = require('../services/publicCatalog');
const { rendererCanServe, SCHEMA_VERSION, SUPPORTED_LOCALES } = require('../services/portfolioPublish');

// Public responses may be cached by shared caches/CDNs; last-known-good is
// served while a revalidation happens in the background.
const PUBLIC_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';

async function publicRoutes(fastify) {
  const currentOrg = () => orgRepo.ensureDefault();
  const isProd = process.env.NODE_ENV === 'production';

  const gate = async (request, reply) => {
    if (!features().v4Portfolio) {
      return reply.code(404).send({
        error: 'Not found', code: 'NOT_FOUND', statusCode: 404, requestId: request.id,
      });
    }
  };

  function localeOf(request, reply) {
    const locale = String((request.query && request.query.locale) || 'sk').toLowerCase();
    if (!SUPPORTED_LOCALES.includes(locale)) {
      reply.code(400).send({ error: `Unsupported locale. Supported: ${SUPPORTED_LOCALES.join(', ')}` });
      return null;
    }
    return locale;
  }

  // Resolve the newest snapshot this renderer can actually serve (last-known-
  // good): if the latest snapshot needs a newer renderer, walk back to the most
  // recent compatible one rather than serving nothing or a version we can't read.
  async function servableSnapshot(orgId, locale) {
    const latest = await portfolioRepo.latestSnapshot(orgId, locale);
    if (!latest) return null;
    if (rendererCanServe({ schemaVersion: latest.schemaVersion }, SCHEMA_VERSION).canServe) return latest;
    // Latest needs a newer renderer — walk back to the newest servable one.
    const history = await portfolioRepo.listSnapshots(orgId, locale, 20);
    for (const snap of history) {
      if (rendererCanServe({ schemaVersion: snap.schemaVersion }, SCHEMA_VERSION).canServe) return snap;
    }
    return null;
  }

  function parseContent(snap) {
    try { return JSON.parse(snap.content); } catch { return null; }
  }

  // Shared: fetch the servable snapshot, honour If-None-Match, set cache headers.
  // Returns { snapshot, content } or null when a response was already sent.
  async function loadForResponse(request, reply, locale) {
    const org = await currentOrg();
    const snapshot = await servableSnapshot(org.id, locale);
    if (!snapshot) { reply.code(404).send({ error: 'No published content for this locale yet.' }); return null; }

    const etag = `"${snapshot.contentHash}"`;
    reply.header('Cache-Control', PUBLIC_CACHE);
    reply.header('ETag', etag);
    reply.header('Vary', 'Accept-Encoding');
    const inm = request.headers['if-none-match'];
    if (inm && inm === etag) { reply.code(304).send(); return null; }

    const content = parseContent(snapshot);
    if (!content) { reply.code(503).send({ error: 'Published snapshot is unreadable.' }); return null; }
    return { org, snapshot, content };
  }

  const auditSink = (evt) => auditV4Repo.append({
    organisation_id: null, action: evt.action, entity_type: 'public_catalog', detail: evt.detail,
  }).catch(() => {});

  // Full catalog for a locale.
  fastify.get('/api/public/catalog', { preHandler: [gate] }, async (request, reply) => {
    const locale = localeOf(request, reply);
    if (!locale) return;
    const loaded = await loadForResponse(request, reply, locale);
    if (!loaded) return;
    const dto = toPublicCatalog(loaded.content, { isProd, audit: auditSink });
    return {
      locale,
      version: loaded.snapshot.version,
      publishedAt: loaded.snapshot.publishedAt,
      catalog: dto,
    };
  });

  // A single product/page by slug, from the snapshot's pages.
  fastify.get('/api/public/products/:slug', { preHandler: [gate] }, async (request, reply) => {
    const locale = localeOf(request, reply);
    if (!locale) return;
    const loaded = await loadForResponse(request, reply, locale);
    if (!loaded) return;
    const dto = toPublicCatalog(loaded.content, { isProd, audit: auditSink });
    const page = dto.pages.find((p) => p.slug === request.params.slug);
    if (!page) return reply.code(404).send({ error: 'Product not found' });
    return { locale, version: loaded.snapshot.version, page };
  });

  // Latest snapshot metadata (no content) — for a renderer to decide whether to
  // refetch. Cheap and cacheable.
  fastify.get('/api/public/snapshot/latest', { preHandler: [gate] }, async (request, reply) => {
    const locale = localeOf(request, reply);
    if (!locale) return;
    const org = await currentOrg();
    const snapshot = await servableSnapshot(org.id, locale);
    if (!snapshot) return reply.code(404).send({ error: 'No published content for this locale yet.' });
    reply.header('Cache-Control', PUBLIC_CACHE);
    reply.header('ETag', `"${snapshot.contentHash}"`);
    return {
      locale,
      version: snapshot.version,
      contentHash: snapshot.contentHash,
      schemaVersion: snapshot.schemaVersion,
      rendererSchemaVersion: SCHEMA_VERSION,
      publishedAt: snapshot.publishedAt,
    };
  });
}

module.exports = publicRoutes;
