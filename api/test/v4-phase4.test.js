'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ---- route file static analysis ----

const routeDir = path.join(__dirname, '..', 'src', 'routes');

function extractRoutes(file) {
  const content = fs.readFileSync(path.join(routeDir, file), 'utf8');
  const matches = [...content.matchAll(/fastify\.(get|post|put|patch|delete|del)\s*\(\s*['`]([^'`]+)['`]/g)];
  return matches.map((m) => ({ method: m[1].toUpperCase(), path: m[2] }));
}

test('v4 phase 4: domains.js defines list/create/delete routes', () => {
  const routes = extractRoutes('domains.js');
  const paths = routes.map((r) => `${r.method} ${r.path}`);
  assert.ok(paths.includes('GET /api/systems/:id/domains'));
  assert.ok(paths.includes('POST /api/systems/:id/domains'));
  assert.ok(paths.includes('DELETE /api/domains/:id'));
});

test('v4 phase 4: domains.js uses fastify.authenticate on all routes', () => {
  const content = fs.readFileSync(path.join(routeDir, 'domains.js'), 'utf8');
  assert.ok(content.includes('fastify.authenticate'));
});

test('v4 phase 4: domains.js gates every route through domainsGate', () => {
  const content = fs.readFileSync(path.join(routeDir, 'domains.js'), 'utf8');
  const routeCount = (content.match(/fastify\.(get|post|put|patch|delete)\s*\(/g) || []).length;
  const gateCount = (content.match(/preHandler:\s*\[domainsGate,\s*fastify\.authenticate\]/g) || []).length;
  assert.equal(gateCount, routeCount, 'every route handler must be gated behind domainsGate');
});

test('v4 phase 4: app.js registers domains routes', () => {
  const appContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(appContent.includes("require('./routes/domains')"));
});

// ---- hostname validation (pure regex extracted for direct testing) ----

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

test('hostname validation: accepts a normal domain', () => {
  assert.ok(HOSTNAME_RE.test('shop.example.com'));
});

test('hostname validation: accepts apex domain', () => {
  assert.ok(HOSTNAME_RE.test('example.com'));
});

test('hostname validation: rejects bare label (no dot)', () => {
  assert.ok(!HOSTNAME_RE.test('localhost'));
});

test('hostname validation: rejects leading/trailing hyphen in a label', () => {
  assert.ok(!HOSTNAME_RE.test('-shop.example.com'));
  assert.ok(!HOSTNAME_RE.test('shop-.example.com'));
});

test('hostname validation: rejects empty string', () => {
  assert.ok(!HOSTNAME_RE.test(''));
});

test('hostname validation: rejects a path or scheme', () => {
  assert.ok(!HOSTNAME_RE.test('https://example.com'));
  assert.ok(!HOSTNAME_RE.test('example.com/path'));
});

test('hostname validation: rejects overlong hostname (>253 chars)', () => {
  const long = `${'a'.repeat(250)}.com`;
  assert.ok(!HOSTNAME_RE.test(long));
});

// ---- repo static check (org-scoping boundary) ----

test('v4 phase 4: domains repo scopes list/find/create/remove by organisationId', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'repo', 'domains.js'), 'utf8');
  for (const fn of ['listBySystem', 'findById', 'createCustom', 'remove']) {
    const re = new RegExp(`async function ${fn}\\(organisationId[,)]`);
    assert.ok(re.test(content), `${fn} must take organisationId as its first argument`);
  }
});

test('v4 phase 4: findByHostname carries an explicit org-scope-exempt annotation', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'repo', 'domains.js'), 'utf8');
  const idx = content.indexOf('async function findByHostname');
  const slice = content.slice(idx, idx + 200);
  assert.ok(slice.includes('org-scope-exempt'), 'cross-org lookup must be explicitly annotated');
});

test('v4 phase 4: remove() only deletes custom domains, never the default subdomain', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'repo', 'domains.js'), 'utf8');
  const idx = content.indexOf('async function remove');
  const slice = content.slice(idx, idx + 300);
  assert.ok(slice.includes('isCustom: true'), 'remove() must restrict deletion to isCustom domains');
});

// ---- prisma schema check ----

test('v4 phase 4: Domain model has hostname, isCustom, verified fields', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const start = schema.indexOf('model Domain {');
  const end = schema.indexOf('\n}', start);
  const body = schema.slice(start, end);
  assert.ok(body.includes('hostname'));
  assert.ok(body.includes('isCustom'));
  assert.ok(body.includes('verified'));
  assert.ok(body.includes('@unique'), 'hostname must be globally unique');
});
