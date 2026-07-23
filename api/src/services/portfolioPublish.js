'use strict';

// V4 Phase 5 — Portfolio CMS publish pipeline.
// Pure logic: draft validation, completeness scoring, snapshot content
// building, hashing, and versioning. No I/O — callers (routes/repo) supply
// data and persist the result. Kept side-effect-free so it can be unit
// tested without a live database.

const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';
const RENDERER_MIN_VERSION = '1.0.0';
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024; // 2MB, per exit-gate requirement
const SUPPORTED_LOCALES = ['sk', 'en'];
const REQUIRED_LOCALE = 'en'; // fallback locale — must always be complete

// ---- Draft validation ----

// A page is publishable when it has a title, a slug, and is not in draft
// status. Legal pages additionally require content.
function validatePage(page) {
  const errors = [];
  if (!page.slug) errors.push('missing slug');
  if (!page.title) errors.push('missing title');
  if (!page.locale || !SUPPORTED_LOCALES.includes(page.locale)) {
    errors.push(`unsupported locale: ${page.locale}`);
  }
  if (page.pageType === 'legal' && !page.content) {
    errors.push('legal page missing content');
  }
  return { valid: errors.length === 0, errors };
}

// Product portfolio profile completeness score (0-100). Used both to gate
// publish-readiness and to render the completeness indicator in the
// dashboard. Weighted toward fields that matter for the public page.
function scoreProfileCompleteness(profile) {
  const weights = {
    title: 20,
    tagline: 10,
    shortDescription: 20,
    fullDescription: 20,
    seoTitle: 10,
    seoDescription: 10,
    coverMediaId: 10,
  };
  let score = 0;
  for (const [field, weight] of Object.entries(weights)) {
    if (profile[field]) score += weight;
  }
  return score;
}

// Translation completeness across locales for a set of pages/profiles keyed
// by a stable identity (slug for pages, productId for profiles). Returns,
// per identity, which locales exist and which are missing.
function translationCompleteness(items, { localeField = 'locale', keyField = 'slug' } = {}) {
  const byKey = new Map();
  for (const item of items) {
    const key = item[keyField];
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(item[localeField]);
  }
  const report = [];
  for (const [key, locales] of byKey) {
    const missing = SUPPORTED_LOCALES.filter((l) => !locales.has(l));
    report.push({
      key,
      locales: [...locales],
      missing,
      complete: missing.length === 0,
      fallbackAvailable: locales.has(REQUIRED_LOCALE),
    });
  }
  return report;
}

// ---- Snapshot building ----

// Deterministic JSON stringify (sorted keys) so identical content always
// hashes the same way regardless of object key insertion order.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function contentHash(content) {
  return crypto.createHash('sha256').update(stableStringify(content)).digest('hex');
}

// Media must be referenced by URL only — never embedded. Reject any block
// data that looks like an inline data: URI or base64 payload.
function assertNoEmbeddedMedia(blocks) {
  for (const block of blocks) {
    const raw = typeof block.data === 'string' ? block.data : JSON.stringify(block.data || {});
    if (/data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(raw)) {
      throw new Error(`Block ${block.id ?? '(new)'} embeds media inline — use a media asset URL instead`);
    }
  }
}

// Build the immutable snapshot content for one locale from draft rows.
// Throws on validation failure or size violation — callers should not
// persist a partially-built snapshot.
function buildSnapshotContent({ locale, pages, profiles, blocks, redirects, legalVersions }) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const pageErrors = [];
  for (const page of pages) {
    const { valid, errors } = validatePage(page);
    if (!valid) pageErrors.push({ slug: page.slug, errors });
  }
  if (pageErrors.length > 0) {
    const detail = pageErrors.map((e) => `${e.slug || '(unknown)'}: ${e.errors.join(', ')}`).join('; ');
    throw new Error(`Cannot publish — invalid pages: ${detail}`);
  }

  assertNoEmbeddedMedia(blocks || []);

  const content = {
    schemaVersion: SCHEMA_VERSION,
    rendererMinVersion: RENDERER_MIN_VERSION,
    locale,
    pages: pages.map((p) => ({
      slug: p.slug, pageType: p.pageType, title: p.title,
      seoTitle: p.seoTitle || null, seoDescription: p.seoDescription || null,
    })),
    profiles: (profiles || []).map((p) => ({
      productId: p.productId, title: p.title, tagline: p.tagline || null,
      shortDescription: p.shortDescription || null, fullDescription: p.fullDescription || null,
      seoTitle: p.seoTitle || null, seoDescription: p.seoDescription || null,
      coverMediaUrl: p.coverMediaUrl || null,
    })),
    blocks: (blocks || []).map((b) => ({
      ownerType: b.ownerType, ownerId: b.ownerId, blockType: b.blockType,
      position: b.position, data: b.data,
    })),
    redirects: (redirects || []).map((r) => ({ from: r.fromPath, to: r.toPath, statusCode: r.statusCode })),
    legal: (legalVersions || []).map((l) => ({ docType: l.docType, version: l.version, effectiveAt: l.effectiveAt })),
  };

  const size = Buffer.byteLength(stableStringify(content), 'utf8');
  if (size > MAX_SNAPSHOT_BYTES) {
    throw new Error(`Snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes (${size} bytes) — trim content or split blocks`);
  }

  return { content, hash: contentHash(content), sizeBytes: size };
}

// ---- Concurrent publish lock ----

// Pure lock-state evaluator. Callers hold the actual lock row (e.g. a
// publish_locks table with a TTL); this just decides, given "now" and a
// candidate lock row, whether a new publish may proceed.
function canAcquirePublishLock(existingLock, now = Date.now(), ttlMs = 5 * 60 * 1000) {
  if (!existingLock) return { allowed: true };
  const lockedAt = existingLock.lockedAt instanceof Date
    ? existingLock.lockedAt.getTime()
    : new Date(existingLock.lockedAt).getTime();
  const expired = now - lockedAt > ttlMs;
  if (expired) return { allowed: true, reason: 'previous lock expired' };
  return { allowed: false, reason: `publish already in progress (locked by ${existingLock.lockedBy ?? 'unknown'})` };
}

// ---- Snapshot schema versioning ----

// Compare two semver-ish "x.y.z" strings. Returns -1, 0, 1.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// The renderer must refuse to serve a snapshot whose schemaVersion is older
// than what it knows how to render, and never silently fall back to a
// partially-understood shape.
function rendererCanServe(snapshot, rendererVersion) {
  if (!snapshot || !snapshot.schemaVersion) {
    return { canServe: false, reason: 'snapshot missing schemaVersion' };
  }
  if (compareVersions(rendererVersion, snapshot.schemaVersion) < 0) {
    return {
      canServe: false,
      reason: `renderer ${rendererVersion} is older than snapshot schema ${snapshot.schemaVersion} — refusing to guess the shape`,
    };
  }
  return { canServe: true };
}

module.exports = {
  SCHEMA_VERSION,
  RENDERER_MIN_VERSION,
  MAX_SNAPSHOT_BYTES,
  SUPPORTED_LOCALES,
  REQUIRED_LOCALE,
  validatePage,
  scoreProfileCompleteness,
  translationCompleteness,
  stableStringify,
  contentHash,
  assertNoEmbeddedMedia,
  buildSnapshotContent,
  canAcquirePublishLock,
  compareVersions,
  rendererCanServe,
};
