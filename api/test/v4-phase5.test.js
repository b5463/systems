'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  SUPPORTED_LOCALES, SCHEMA_VERSION, MAX_SNAPSHOT_BYTES,
  validatePage, scoreProfileCompleteness, translationCompleteness,
  stableStringify, contentHash, assertNoEmbeddedMedia,
  buildSnapshotContent, canAcquirePublishLock, compareVersions, rendererCanServe,
} = require('../src/services/portfolioPublish');

// ---- validatePage ----

test('portfolio: validatePage rejects missing slug', () => {
  const r = validatePage({ title: 'Home', locale: 'en' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('slug')));
});

test('portfolio: validatePage rejects unsupported locale', () => {
  const r = validatePage({ slug: 'home', title: 'Home', locale: 'de' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('locale')));
});

test('portfolio: validatePage requires content for legal pages', () => {
  const r = validatePage({ slug: 'terms', title: 'Terms', locale: 'en', pageType: 'legal' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('content')));
});

test('portfolio: validatePage passes for a complete page', () => {
  const r = validatePage({ slug: 'home', title: 'Home', locale: 'en', pageType: 'homepage' });
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

// ---- scoreProfileCompleteness ----

test('portfolio: scoreProfileCompleteness is 0 for empty profile', () => {
  assert.equal(scoreProfileCompleteness({}), 0);
});

test('portfolio: scoreProfileCompleteness is 100 for fully filled profile', () => {
  const profile = {
    title: 'x', tagline: 'x', shortDescription: 'x', fullDescription: 'x',
    seoTitle: 'x', seoDescription: 'x', coverMediaId: 'x',
  };
  assert.equal(scoreProfileCompleteness(profile), 100);
});

test('portfolio: scoreProfileCompleteness partial score', () => {
  assert.equal(scoreProfileCompleteness({ title: 'x' }), 20);
});

// ---- translationCompleteness ----

test('portfolio: translationCompleteness detects missing locale', () => {
  const pages = [{ slug: 'home', locale: 'en' }];
  const report = translationCompleteness(pages);
  assert.equal(report.length, 1);
  assert.equal(report[0].complete, false);
  assert.deepEqual(report[0].missing, ['sk']);
});

test('portfolio: translationCompleteness reports complete when both locales exist', () => {
  const pages = [{ slug: 'home', locale: 'en' }, { slug: 'home', locale: 'sk' }];
  const report = translationCompleteness(pages);
  assert.equal(report[0].complete, true);
  assert.deepEqual(report[0].missing, []);
});

test('portfolio: translationCompleteness flags fallback availability', () => {
  const pages = [{ slug: 'home', locale: 'sk' }];
  const report = translationCompleteness(pages);
  assert.equal(report[0].fallbackAvailable, false); // en missing
});

test('portfolio: translationCompleteness works with productId key', () => {
  const profiles = [{ productId: 'p1', locale: 'en' }, { productId: 'p1', locale: 'sk' }];
  const report = translationCompleteness(profiles, { keyField: 'productId' });
  assert.equal(report[0].key, 'p1');
  assert.equal(report[0].complete, true);
});

// ---- stableStringify / contentHash ----

test('portfolio: stableStringify is key-order independent', () => {
  const a = stableStringify({ b: 1, a: 2 });
  const b = stableStringify({ a: 2, b: 1 });
  assert.equal(a, b);
});

test('portfolio: contentHash is deterministic regardless of key order', () => {
  const h1 = contentHash({ x: 1, y: 2 });
  const h2 = contentHash({ y: 2, x: 1 });
  assert.equal(h1, h2);
});

test('portfolio: contentHash differs for different content', () => {
  assert.notEqual(contentHash({ x: 1 }), contentHash({ x: 2 }));
});

// ---- assertNoEmbeddedMedia ----

test('portfolio: assertNoEmbeddedMedia throws on base64 data URI', () => {
  const blocks = [{ id: 1, data: { image: 'data:image/png;base64,AAAA' } }];
  assert.throws(() => assertNoEmbeddedMedia(blocks), /embeds media inline/);
});

test('portfolio: assertNoEmbeddedMedia passes for URL references', () => {
  const blocks = [{ id: 1, data: { image: 'https://cdn.example.com/x.png' } }];
  assert.doesNotThrow(() => assertNoEmbeddedMedia(blocks));
});

// ---- buildSnapshotContent ----

test('portfolio: buildSnapshotContent rejects unsupported locale', () => {
  assert.throws(
    () => buildSnapshotContent({ locale: 'de', pages: [], profiles: [], blocks: [], redirects: [], legalVersions: [] }),
    /Unsupported locale/,
  );
});

test('portfolio: buildSnapshotContent rejects invalid pages', () => {
  const pages = [{ slug: '', title: '', locale: 'en' }];
  assert.throws(
    () => buildSnapshotContent({ locale: 'en', pages, profiles: [], blocks: [], redirects: [], legalVersions: [] }),
    /Cannot publish/,
  );
});

test('portfolio: buildSnapshotContent produces content, hash, and size for valid draft', () => {
  const pages = [{ slug: 'home', title: 'Home', locale: 'en', pageType: 'homepage' }];
  const result = buildSnapshotContent({ locale: 'en', pages, profiles: [], blocks: [], redirects: [], legalVersions: [] });
  assert.equal(result.content.locale, 'en');
  assert.equal(result.content.schemaVersion, SCHEMA_VERSION);
  assert.equal(typeof result.hash, 'string');
  assert.equal(result.hash.length, 64); // sha256 hex
  assert.ok(result.sizeBytes > 0);
});

test('portfolio: buildSnapshotContent enforces max snapshot size', () => {
  const pages = [{ slug: 'home', title: 'Home', locale: 'en', pageType: 'homepage' }];
  const blocks = [{ ownerType: 'page', ownerId: 'p1', blockType: 'text', position: 0, data: { text: 'x'.repeat(MAX_SNAPSHOT_BYTES) } }];
  assert.throws(
    () => buildSnapshotContent({ locale: 'en', pages, profiles: [], blocks, redirects: [], legalVersions: [] }),
    /exceeds/,
  );
});

test('portfolio: buildSnapshotContent throws on embedded media in blocks', () => {
  const pages = [{ slug: 'home', title: 'Home', locale: 'en', pageType: 'homepage' }];
  const blocks = [{ ownerType: 'page', ownerId: 'p1', blockType: 'image', position: 0, data: { image: 'data:image/png;base64,AAAA' } }];
  assert.throws(
    () => buildSnapshotContent({ locale: 'en', pages, profiles: [], blocks, redirects: [], legalVersions: [] }),
    /embeds media inline/,
  );
});

// ---- canAcquirePublishLock ----

test('portfolio: canAcquirePublishLock allows when no lock exists', () => {
  const r = canAcquirePublishLock(null);
  assert.equal(r.allowed, true);
});

test('portfolio: canAcquirePublishLock rejects concurrent publish within TTL', () => {
  const r = canAcquirePublishLock({ lockedAt: new Date(), lockedBy: 'admin-1' }, Date.now(), 5 * 60 * 1000);
  assert.equal(r.allowed, false);
  assert.ok(r.reason.includes('already in progress'));
});

test('portfolio: canAcquirePublishLock allows after TTL expiry', () => {
  const oldLock = { lockedAt: new Date(Date.now() - 10 * 60 * 1000), lockedBy: 'admin-1' };
  const r = canAcquirePublishLock(oldLock, Date.now(), 5 * 60 * 1000);
  assert.equal(r.allowed, true);
});

// ---- compareVersions / rendererCanServe ----

test('portfolio: compareVersions orders correctly', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.1.0', '1.0.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.1.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
});

test('portfolio: rendererCanServe rejects snapshot with newer schema than renderer', () => {
  const r = rendererCanServe({ schemaVersion: '2.0.0' }, '1.0.0');
  assert.equal(r.canServe, false);
  assert.ok(r.reason.includes('refusing to guess'));
});

test('portfolio: rendererCanServe accepts snapshot with equal or older schema', () => {
  const r = rendererCanServe({ schemaVersion: '1.0.0' }, '1.0.0');
  assert.equal(r.canServe, true);
});

test('portfolio: rendererCanServe rejects snapshot missing schemaVersion', () => {
  const r = rendererCanServe({}, '1.0.0');
  assert.equal(r.canServe, false);
});

// ---- SUPPORTED_LOCALES ----

test('portfolio: supported locales are exactly sk and en', () => {
  assert.deepEqual([...SUPPORTED_LOCALES].sort(), ['en', 'sk']);
});

// ---- route file static analysis ----

const routeDir = path.join(__dirname, '..', 'src', 'routes');

function extractRoutes(file) {
  const content = fs.readFileSync(path.join(routeDir, file), 'utf8');
  const matches = [...content.matchAll(/fastify\.(get|post|put|patch|delete|del)\s*\(\s*['`]([^'`]+)['`]/g)];
  return matches.map((m) => ({ method: m[1].toUpperCase(), path: m[2] }));
}

test('v4 phase 5: portfolio.js defines the full CMS surface', () => {
  const routes = extractRoutes('portfolio.js');
  const paths = routes.map((r) => `${r.method} ${r.path}`);
  const required = [
    'GET /api/portfolio/pages', 'PUT /api/portfolio/pages',
    'GET /api/portfolio/profiles', 'PUT /api/portfolio/profiles',
    'GET /api/portfolio/blocks', 'PUT /api/portfolio/blocks', 'DELETE /api/portfolio/blocks/:id',
    'GET /api/portfolio/redirects', 'POST /api/portfolio/redirects', 'DELETE /api/portfolio/redirects/:id',
    'GET /api/portfolio/legal', 'POST /api/portfolio/legal',
    'GET /api/portfolio/media',
    'GET /api/portfolio/locales',
    'POST /api/portfolio/preview',
    'POST /api/portfolio/publish',
    'GET /api/portfolio/snapshots',
    'POST /api/portfolio/snapshots/:version/rollback',
  ];
  for (const r of required) {
    assert.ok(paths.includes(r), `Missing route: ${r}`);
  }
});

test('v4 phase 5: portfolio.js uses fastify.authenticate on all routes', () => {
  const content = fs.readFileSync(path.join(routeDir, 'portfolio.js'), 'utf8');
  assert.ok(content.includes('fastify.authenticate'));
});

test('v4 phase 5: portfolio.js gates every route through portfolioGate', () => {
  const content = fs.readFileSync(path.join(routeDir, 'portfolio.js'), 'utf8');
  const routeCount = (content.match(/fastify\.(get|post|put|patch|delete)\s*\(/g) || []).length;
  const gateCount = (content.match(/preHandler:\s*\[portfolioGate,\s*fastify\.authenticate\]/g) || []).length;
  assert.equal(gateCount, routeCount, 'every route handler must be gated behind portfolioGate');
});

test('v4 phase 5: portfolio.js resolves org via orgRepo.ensureDefault (org-scoping rule)', () => {
  const content = fs.readFileSync(path.join(routeDir, 'portfolio.js'), 'utf8');
  const routeCount = (content.match(/fastify\.(get|post|put|patch|delete)\s*\(/g) || []).length;
  const orgCalls = (content.match(/currentOrg\(\)/g) || []).length;
  assert.ok(orgCalls >= routeCount, 'every route must resolve the current organisation');
});

test('flags: v4Portfolio off by default', () => {
  const flags = require('../src/util/flags');
  assert.equal(flags.features({}).v4Portfolio, false);
});

test('flags: v4Portfolio enabled via ENABLE_V4_PORTFOLIO=true', () => {
  const flags = require('../src/util/flags');
  assert.equal(flags.features({ ENABLE_V4_PORTFOLIO: 'true' }).v4Portfolio, true);
});

// ---- Prisma schema static check ----

test('v4 phase 5: prisma schema defines all 10 portfolio tables', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const requiredTables = [
    'portfolio_pages', 'product_portfolio_profiles', 'portfolio_blocks',
    'portfolio_snapshots', 'portfolio_redirects', 'public_forms',
    'form_submissions', 'media_assets', 'legal_versions',
  ];
  for (const t of requiredTables) {
    assert.ok(schema.includes(`@@map("${t}")`), `Missing table mapping: ${t}`);
  }
});

test('v4 phase 5: portfolio tables are org-scoped (organisationId column)', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const models = [
    'PortfolioPage', 'ProductPortfolioProfile', 'PortfolioBlock', 'PortfolioSnapshot',
    'PortfolioRedirect', 'PublicForm', 'FormSubmission', 'MediaAsset', 'LegalVersion',
  ];
  for (const m of models) {
    const start = schema.indexOf(`model ${m} `);
    assert.ok(start !== -1, `model ${m} not found`);
    const end = schema.indexOf('\n}', start);
    const body = schema.slice(start, end);
    assert.ok(body.includes('organisationId'), `${m} must carry organisationId (org-scoping rule)`);
  }
});

test('v4 phase 5: portfolio_snapshots has a unique constraint on (organisationId, locale, version)', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const modelStart = schema.indexOf('model PortfolioSnapshot');
  const modelEnd = schema.indexOf('}', modelStart);
  const modelBody = schema.slice(modelStart, modelEnd);
  assert.ok(modelBody.includes('@@unique([organisationId, locale, version])'));
});

// ---- repo static check (org-scoping) ----

test('v4 phase 5: portfolio repo takes organisationId as first argument on every export', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'repo', 'portfolio.js'), 'utf8');
  const fnMatches = [...content.matchAll(/^async function (\w+)\(organisationId[,)]/gm)];
  assert.ok(fnMatches.length >= 10, `expected at least 10 org-scoped functions, found ${fnMatches.length}`);
});
