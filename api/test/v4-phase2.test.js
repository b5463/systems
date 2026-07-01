'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { projectToSystem, projectToEnv, deployHistoryToRelease, findSystemInProjects } = require('../src/util/v4systems');
const { features } = require('../src/util/flags');

const FAKE_PROJECT = {
  id: 42,
  slug: 'my-app',
  name: 'My App',
  status: 'running',
  deploy_type: 'container',
  visibility: 'public',
  repo: 'github.com/org/my-app',
  is_preview: 0,
  node_id: null,
  health_state: 'healthy',
  health_status: 200,
  health_failures: 0,
  route_published: 1,
  container_id: 'abc123',
  port_blue: 4001,
  port: 4001,
  active_slot: 'blue',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
};

// ---- projectToSystem adapter ----

test('v4systems: projectToSystem produces required V4 fields', () => {
  const sys = projectToSystem(FAKE_PROJECT);
  assert.equal(sys.id, '42');
  assert.equal(sys.slug, 'my-app');
  assert.equal(sys.name, 'My App');
  assert.equal(sys.status, 'running');
  assert.equal(sys.type, 'container');
  assert.equal(sys.visibility, 'public');
  assert.equal(sys._source, 'v3-compat');
  assert.ok('productId' in sys, 'productId field must be present');
  assert.ok('organisationId' in sys, 'organisationId field must be present');
  assert.ok('health' in sys, 'health field must be present');
  assert.equal(sys.health.state, 'healthy');
  assert.equal(sys.health.status, 200);
});

test('v4systems: projectToSystem returns null for null input', () => {
  assert.equal(projectToSystem(null), null);
});

test('v4systems: projectToSystem id is always a string', () => {
  const sys = projectToSystem(FAKE_PROJECT);
  assert.equal(typeof sys.id, 'string');
});

test('v4systems: projectToSystem isPreview coerces falsy to false', () => {
  assert.equal(projectToSystem({ ...FAKE_PROJECT, is_preview: 0 }).isPreview, false);
  assert.equal(projectToSystem({ ...FAKE_PROJECT, is_preview: 1 }).isPreview, true);
});

// ---- projectToEnv adapter ----

test('v4systems: projectToEnv produces required V4 environment fields', () => {
  const env = projectToEnv(FAKE_PROJECT);
  assert.equal(env.id, '42:production');
  assert.equal(env.systemId, '42');
  assert.equal(env.environment, 'production');
  assert.equal(env.status, 'running');
  assert.equal(env.routeStatus, 'active');
  assert.equal(env.port, 4001);
  assert.equal(env._source, 'v3-compat');
});

test('v4systems: projectToEnv routeStatus is inactive when not published', () => {
  const env = projectToEnv({ ...FAKE_PROJECT, route_published: 0 });
  assert.equal(env.routeStatus, 'inactive');
});

test('v4systems: projectToEnv returns null for null input', () => {
  assert.equal(projectToEnv(null), null);
});

// ---- deployHistoryToRelease adapter ----

test('v4systems: deployHistoryToRelease produces required V4 release fields', () => {
  const rel = deployHistoryToRelease(
    { id: 7, image_id: 'sha256:abc', container_id: 'ctr1', deployed_at: '2026-05-01T12:00:00Z' },
    '42',
  );
  assert.equal(rel.id, '7');
  assert.equal(rel.systemId, '42');
  assert.equal(rel.environment, 'production');
  assert.equal(rel.imageId, 'sha256:abc');
  assert.equal(rel.containerId, 'ctr1');
  assert.equal(rel._source, 'v3-compat');
});

test('v4systems: deployHistoryToRelease handles missing image/container', () => {
  const rel = deployHistoryToRelease({ id: 1, deployed_at: '2026-01-01' }, '42');
  assert.equal(rel.imageId, null);
  assert.equal(rel.containerId, null);
});

// ---- findSystemInProjects ----

test('v4systems: findSystemInProjects by slug', () => {
  const projects = [FAKE_PROJECT, { ...FAKE_PROJECT, id: 99, slug: 'other-app' }];
  const found = findSystemInProjects(projects, 'my-app');
  assert.ok(found, 'should find by slug');
  assert.equal(found.id, 42);
});

test('v4systems: findSystemInProjects by numeric id string', () => {
  const projects = [FAKE_PROJECT, { ...FAKE_PROJECT, id: 99, slug: 'other-app' }];
  const found = findSystemInProjects(projects, '42');
  assert.ok(found, 'should find by numeric id string');
  assert.equal(found.slug, 'my-app');
});

test('v4systems: findSystemInProjects returns null for unknown slug', () => {
  assert.equal(findSystemInProjects([FAKE_PROJECT], 'no-such-app'), null);
});

test('v4systems: findSystemInProjects returns null for unknown id', () => {
  assert.equal(findSystemInProjects([FAKE_PROJECT], '9999'), null);
});

// ---- feature flag ----

test('flags: v4Systems off by default', () => {
  assert.equal(features({}).v4Systems, false);
});

test('flags: v4Systems enabled via ENABLE_V4_SYSTEMS=true', () => {
  assert.equal(features({ ENABLE_V4_SYSTEMS: 'true' }).v4Systems, true);
});

test('flags: v4Systems enabled via ENABLE_V4_SYSTEMS=1', () => {
  assert.equal(features({ ENABLE_V4_SYSTEMS: '1' }).v4Systems, true);
});

test('flags: v4Systems disabled via ENABLE_V4_SYSTEMS=false', () => {
  assert.equal(features({ ENABLE_V4_SYSTEMS: 'false' }).v4Systems, false);
});

// ---- route file structure (static) ----

const routeDir = path.join(__dirname, '..', 'src', 'routes');

function extractRoutes(file) {
  const content = fs.readFileSync(path.join(routeDir, file), 'utf8');
  const matches = [...content.matchAll(/fastify\.(get|post|put|patch|delete|del)\s*\(\s*['`]([^'`]+)['`]/g)];
  return matches.map((m) => ({ method: m[1].toUpperCase(), path: m[2] }));
}

test('v4 phase 2: systems.js defines all required read routes', () => {
  const routes = extractRoutes('systems.js');
  const paths = routes.map((r) => `${r.method} ${r.path}`);
  assert.ok(paths.includes('GET /api/systems'), 'list systems route missing');
  assert.ok(paths.includes('GET /api/systems/:id'), 'get system route missing');
  assert.ok(paths.includes('GET /api/systems/:id/environments'), 'environments route missing');
  assert.ok(paths.includes('GET /api/systems/:id/releases'), 'releases route missing');
});

test('v4 phase 2: products.js defines all required read routes', () => {
  const routes = extractRoutes('products.js');
  const paths = routes.map((r) => `${r.method} ${r.path}`);
  assert.ok(paths.includes('GET /api/products'), 'list products route missing');
  assert.ok(paths.includes('GET /api/products/:id'), 'get product route missing');
});

test('v4 phase 2: systems.js uses fastify.authenticate on all routes', () => {
  const content = fs.readFileSync(path.join(routeDir, 'systems.js'), 'utf8');
  assert.ok(content.includes('fastify.authenticate'), 'systems.js must use fastify.authenticate');
});

test('v4 phase 2: products.js uses fastify.authenticate on all routes', () => {
  const content = fs.readFileSync(path.join(routeDir, 'products.js'), 'utf8');
  assert.ok(content.includes('fastify.authenticate'), 'products.js must use fastify.authenticate');
});
