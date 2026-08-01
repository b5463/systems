'use strict';

// V4 Phase 5 (Alex) — public catalog API + DTO allowlist.
//   - pure: the allowlist strips/throws on non-public fields
//   - DB-backed: /api/public/* serves immutable snapshots (never live tables),
//     with ETag/304, last-known-good, and flag gating

const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'systems-p5pub-'));
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '10000';

const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { toPublicCatalog } = require('../src/services/publicCatalog');

// ── Pure allowlist ──────────────────────────────────────────────────────────

test('public DTO allowlist: passes clean content through', () => {
  const content = {
    schemaVersion: '1.0.0', rendererMinVersion: '1.0.0', locale: 'sk',
    pages: [{ slug: 'home', pageType: 'home', title: 'Domov', seoTitle: 'SEO', seoDescription: 'd' }],
    profiles: [{ productId: 'p1', title: 'Prod', tagline: 't' }],
    blocks: [{ ownerType: 'page', ownerId: 'x', blockType: 'hero', position: 0, data: { text: 'hi' } }],
    redirects: [{ from: '/a', to: '/b', statusCode: 301 }],
    legal: [{ docType: 'terms', version: '1', effectiveAt: '2026-01-01' }],
  };
  const dto = toPublicCatalog(content, { isProd: false });
  assert.equal(dto.pages[0].slug, 'home');
  assert.equal(dto.blocks[0].data.text, 'hi');
});

test('public DTO allowlist: THROWS in non-prod on a leaked internal field', () => {
  const content = {
    schemaVersion: '1.0.0', locale: 'sk',
    pages: [{ slug: 'home', pageType: 'home', title: 'Domov', containerId: 'deploy_home', port: 4123 }],
    profiles: [], blocks: [], redirects: [], legal: [],
  };
  assert.throws(() => toPublicCatalog(content, { isProd: false }), /leak non-allowlisted fields/);
});

test('public DTO allowlist: strips + audits in prod, never emits the field', () => {
  const audited = [];
  const content = {
    schemaVersion: '1.0.0', locale: 'sk', repoUrl: 'git@secret', adminId: 7,
    pages: [{ slug: 'home', pageType: 'home', title: 'T', apiKey: 'sk_live_x' }],
    profiles: [], blocks: [], redirects: [], legal: [],
  };
  const dto = toPublicCatalog(content, { isProd: true, audit: (e) => audited.push(e) });
  assert.ok(!('repoUrl' in dto));
  assert.ok(!('adminId' in dto));
  assert.ok(!('apiKey' in dto.pages[0]));
  assert.equal(dto.pages[0].slug, 'home');
  assert.equal(audited.length, 1);
  assert.match(audited[0].detail, /repoUrl|adminId|apiKey/);
});

test('catalog offload is disabled (no-op) without S3 config, and never throws', async () => {
  const { offloadSnapshot } = require('../src/services/catalogOffload');
  const res = await offloadSnapshot({ locale: 'sk', version: 1, content: snapshotContentPure(), publishedAt: new Date() });
  assert.equal(res.offloaded, false);
  assert.equal(res.reason, 'disabled');
});

function snapshotContentPure() {
  return {
    schemaVersion: '1.0.0', rendererMinVersion: '1.0.0', locale: 'sk',
    pages: [{ slug: 'home', pageType: 'home', title: 'Domov' }],
    profiles: [], blocks: [], redirects: [], legal: [],
  };
}

// ── DB-backed ───────────────────────────────────────────────────────────────

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 phase 5 public db tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
  return;
}

const { orgRepo, portfolioRepo } = require('../src/repo');
const { buildApp } = require('../src/app');

let app; let org;
const flagOn = () => { process.env.ENABLE_V4_PORTFOLIO = 'true'; };
const flagOff = () => { delete process.env.ENABLE_V4_PORTFOLIO; };

function snapshotContent(locale, { schemaVersion = '1.0.0' } = {}) {
  return {
    schemaVersion, rendererMinVersion: '1.0.0', locale,
    pages: [{ slug: 'home', pageType: 'home', title: locale === 'sk' ? 'Domov' : 'Home' }],
    profiles: [], blocks: [], redirects: [], legal: [],
  };
}

before(async () => {
  flagOff();
  await resetDb();
  app = await buildApp();
  await app.ready();
  org = await orgRepo.ensureDefault();
});

after(async () => {
  flagOff();
  if (app) await app.close();
  await prisma.$disconnect();
});

test('public catalog is dark with the flag off', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/public/catalog?locale=sk' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'NOT_FOUND');
  assert.equal(res.headers['set-cookie'], undefined);
});

test('public catalog serves the latest snapshot with an ETag; 304 on revalidation', async () => {
  flagOn();
  try {
    await portfolioRepo.createSnapshot(org.id, { locale: 'sk', content: snapshotContent('sk'), contentHash: 'hash-sk-1', schemaVersion: '1.0.0' });
    const res = await app.inject({ method: 'GET', url: '/api/public/catalog?locale=sk' });
    assert.equal(res.statusCode, 200, res.payload);
    const body = res.json();
    assert.equal(body.locale, 'sk');
    assert.equal(body.catalog.pages[0].title, 'Domov');
    assert.equal(res.headers.etag, '"hash-sk-1"');
    assert.match(res.headers['cache-control'], /stale-while-revalidate/);

    // Conditional GET → 304.
    const revalidate = await app.inject({ method: 'GET', url: '/api/public/catalog?locale=sk', headers: { 'if-none-match': '"hash-sk-1"' } });
    assert.equal(revalidate.statusCode, 304);
  } finally { flagOff(); }
});

test('public catalog serves last-known-good when the newest snapshot needs a newer renderer', async () => {
  flagOn();
  try {
    // v1 servable (schema 1.0.0), v2 needs a newer renderer (schema 2.0.0).
    await portfolioRepo.createSnapshot(org.id, { locale: 'en', content: snapshotContent('en', { schemaVersion: '1.0.0' }), contentHash: 'en-good', schemaVersion: '1.0.0' });
    await portfolioRepo.createSnapshot(org.id, { locale: 'en', content: snapshotContent('en', { schemaVersion: '2.0.0' }), contentHash: 'en-future', schemaVersion: '2.0.0' });

    const res = await app.inject({ method: 'GET', url: '/api/public/catalog?locale=en' });
    assert.equal(res.statusCode, 200, res.payload);
    assert.equal(res.json().version, 1, 'falls back to the last servable snapshot, not the future one');
    assert.equal(res.headers.etag, '"en-good"');
  } finally { flagOff(); }
});

test('public product-by-slug and snapshot metadata endpoints', async () => {
  flagOn();
  try {
    const prod = await app.inject({ method: 'GET', url: '/api/public/products/home?locale=sk' });
    assert.equal(prod.statusCode, 200, prod.payload);
    assert.equal(prod.json().page.slug, 'home');

    const missing = await app.inject({ method: 'GET', url: '/api/public/products/nope?locale=sk' });
    assert.equal(missing.statusCode, 404);

    const meta = await app.inject({ method: 'GET', url: '/api/public/snapshot/latest?locale=sk' });
    assert.equal(meta.statusCode, 200);
    assert.equal(meta.json().contentHash, 'hash-sk-1');
    assert.equal(meta.json().rendererSchemaVersion, '1.0.0');

    const badLocale = await app.inject({ method: 'GET', url: '/api/public/catalog?locale=de' });
    assert.equal(badLocale.statusCode, 400);
  } finally { flagOff(); }
});
