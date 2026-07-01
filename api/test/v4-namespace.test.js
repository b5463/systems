'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const routeDir = path.join(__dirname, '..', 'src', 'routes');

function extractRoutes(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = [...content.matchAll(/fastify\.(get|post|put|patch|delete|del)\s*\(\s*['`]([^'`]+)['`]/g)];
  return matches.map((m) => ({ method: m[1].toUpperCase(), path: m[2], file: path.basename(filePath) }));
}

function allRoutes() {
  const files = fs.readdirSync(routeDir).filter((f) => f.endsWith('.js'));
  return files.flatMap((f) => extractRoutes(path.join(routeDir, f)));
}

// V4 reserved namespaces — these must not have any routes yet
const RESERVED_NAMESPACES = [
  '/api/public/',
  '/api/ingest/',
  '/api/webhooks/',
];

// Current namespaces — these must exist
const EXISTING_NAMESPACES = [
  '/api/admin/',
  '/api/auth/',
  '/api/audit',
  '/api/deploy',
  '/api/projects',
  '/api/server/',
  '/api/webhook/',
  '/api/systems',
  '/api/products',
];

// ---- namespace boundary tests ----

test('namespace: all routes live under /api/', () => {
  const routes = allRoutes();
  assert.ok(routes.length > 0, 'should find at least one route');
  for (const r of routes) {
    assert.ok(
      r.path.startsWith('/api/'),
      `Route ${r.method} ${r.path} in ${r.file} is outside /api/ namespace`,
    );
  }
});

test('namespace: reserved V4 namespaces have no routes yet', () => {
  const routes = allRoutes();
  for (const ns of RESERVED_NAMESPACES) {
    const conflicts = routes.filter((r) => r.path.startsWith(ns));
    assert.equal(
      conflicts.length,
      0,
      `Reserved namespace ${ns} has unexpected routes: ${conflicts.map((r) => r.path).join(', ')}`,
    );
  }
});

test('namespace: existing namespaces have routes', () => {
  const routes = allRoutes();
  for (const ns of EXISTING_NAMESPACES) {
    const found = routes.filter((r) => r.path.startsWith(ns));
    assert.ok(
      found.length > 0,
      `Expected namespace ${ns} to have routes`,
    );
  }
});

test('namespace: admin routes are in admin.js', () => {
  const routes = allRoutes();
  const adminRoutes = routes.filter((r) => r.path.startsWith('/api/admin/'));
  for (const r of adminRoutes) {
    assert.equal(r.file, 'admin.js', `Admin route ${r.path} should be in admin.js, found in ${r.file}`);
  }
});

test('namespace: auth routes are in auth.js or tokens.js', () => {
  const routes = allRoutes();
  const authRoutes = routes.filter((r) => r.path.startsWith('/api/auth/'));
  for (const r of authRoutes) {
    assert.ok(
      r.file === 'auth.js' || r.file === 'tokens.js',
      `Auth route ${r.path} should be in auth.js or tokens.js, found in ${r.file}`,
    );
  }
});

test('namespace: server routes are in server.js', () => {
  const routes = allRoutes();
  const serverRoutes = routes.filter((r) => r.path.startsWith('/api/server/'));
  for (const r of serverRoutes) {
    assert.equal(r.file, 'server.js', `Server route ${r.path} should be in server.js, found in ${r.file}`);
  }
});

test('namespace: all route files use preHandler authenticate', () => {
  const files = fs.readdirSync(routeDir).filter((f) => f.endsWith('.js'));
  const PUBLIC_FILES = new Set(['webhook.js', 'attestation.js', 'buildpipeline.js']);
  for (const f of files) {
    if (PUBLIC_FILES.has(f)) continue;
    const content = fs.readFileSync(path.join(routeDir, f), 'utf8');
    const hasRoutes = /fastify\.(get|post|put|patch|delete|del)\s*\(/.test(content);
    if (!hasRoutes) continue;
    const hasAuth = content.includes('fastify.authenticate');
    assert.ok(hasAuth, `Route file ${f} defines routes but does not use fastify.authenticate`);
  }
});

test('namespace: webhook routes exist at /api/webhook/ (not /api/webhooks/)', () => {
  const routes = allRoutes();
  const webhookRoutes = routes.filter((r) => r.path.startsWith('/api/webhook/'));
  assert.ok(webhookRoutes.length > 0, 'Expected at least one webhook route');
  const wrongNs = routes.filter((r) => r.path.startsWith('/api/webhooks/'));
  assert.equal(wrongNs.length, 0, '/api/webhooks/ is reserved for V4; current webhooks are at /api/webhook/');
});

test('namespace: no route paths contain double slashes', () => {
  const routes = allRoutes();
  for (const r of routes) {
    assert.ok(!r.path.includes('//'), `Route ${r.path} contains double slashes`);
  }
});

test('namespace: route count is tracked (regression guard)', () => {
  const routes = allRoutes();
  assert.ok(routes.length >= 85, `Expected at least 85 routes, found ${routes.length}`);
  assert.ok(routes.length <= 125, `Unexpected route explosion: ${routes.length} routes (expected <= 125)`);
});

test('namespace: app.js registers all route files', () => {
  const appContent = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const routeFiles = fs.readdirSync(routeDir).filter((f) => f.endsWith('.js'));
  for (const f of routeFiles) {
    const modName = f.replace('.js', '');
    assert.ok(
      appContent.includes(`'./routes/${modName}'`),
      `Route file ${f} is not registered in app.js`,
    );
  }
});
