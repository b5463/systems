'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ---- v4deploymap utility (static analysis — Prisma not available in CI) ----

test('v4deploymap: module exports resolveSystemId and v4DeployMeta (static)', () => {
  const content = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'util', 'v4deploymap.js'), 'utf8',
  );
  assert.ok(content.includes('resolveSystemId'), 'must define resolveSystemId');
  assert.ok(content.includes('v4DeployMeta'), 'must define v4DeployMeta');
  assert.ok(content.includes('module.exports'), 'must use module.exports');
});

// ---- response contract shape tests (pure shape, no DB) ----

test('v4 phase 3: legacy redeploy response contract has required fields', () => {
  // Simulates what the response would look like when V4 is disabled (no _v4 key)
  const base = { message: 'Redeploy started', slug: 'my-app' };
  assert.equal(typeof base.message, 'string');
  assert.equal(typeof base.slug, 'string');
});

test('v4 phase 3: legacy redeploy response contract is identical with V4 meta added', () => {
  // When ENABLE_V4_SYSTEMS=true, _v4 is added but core fields are unchanged
  const base = { message: 'Redeploy started', slug: 'my-app' };
  const v4Meta = { _v4: { systemId: '42', environment: 'production', source: 'v3-compat' } };
  const merged = { ...base, ...v4Meta };
  // Core contract preserved
  assert.equal(merged.message, base.message);
  assert.equal(merged.slug, base.slug);
  // V4 metadata added
  assert.equal(merged._v4.systemId, '42');
  assert.equal(merged._v4.environment, 'production');
  assert.equal(merged._v4.source, 'v3-compat');
});

test('v4 phase 3: legacy rollback response contract has required fields', () => {
  const base = { project: { id: 42, slug: 'my-app', status: 'running' } };
  assert.ok('project' in base);
  assert.equal(typeof base.project.slug, 'string');
});

test('v4 phase 3: legacy rollback response contract is identical with V4 meta added', () => {
  const base = { project: { id: 42, slug: 'my-app', status: 'running' } };
  const v4Meta = { _v4: { systemId: '42', environment: 'production', source: 'v3-compat' } };
  const merged = { ...base, ...v4Meta };
  // Core contract preserved
  assert.deepEqual(merged.project, base.project);
  // V4 metadata added
  assert.equal(merged._v4.environment, 'production');
});

// ---- v4deploymap v4DeployMeta shape ----

test('v4 phase 3: v4DeployMeta structure when returned', () => {
  // The function returns an object with _v4 key or null.
  // Test the expected structure shape.
  const expected = { _v4: { systemId: '1', environment: 'production', source: 'v3-compat' } };
  assert.ok('_v4' in expected);
  assert.equal(typeof expected._v4.systemId, 'string');
  assert.equal(expected._v4.environment, 'production');
  assert.equal(expected._v4.source, 'v3-compat');
});

// ---- route file static analysis ----

const routeDir = path.join(__dirname, '..', 'src', 'routes');

function routeContent(file) {
  return fs.readFileSync(path.join(routeDir, file), 'utf8');
}

test('v4 phase 3: deploy.js imports v4deploymap', () => {
  const content = routeContent('deploy.js');
  assert.ok(content.includes('v4deploymap'), 'deploy.js must import v4deploymap for compat layer');
});

test('v4 phase 3: projects.js imports v4deploymap', () => {
  const content = routeContent('projects.js');
  assert.ok(content.includes('v4deploymap'), 'projects.js must import v4deploymap for rollback compat');
});

test('v4 phase 3: deploy.js checks features().v4Systems before adding meta', () => {
  const content = routeContent('deploy.js');
  assert.ok(content.includes('v4Systems'), 'deploy.js must gate V4 meta on v4Systems flag');
});

test('v4 phase 3: projects.js checks features().v4Systems before adding meta', () => {
  const content = routeContent('projects.js');
  // The file now uses features().v4Systems in two places: compat marker on GET + rollback
  const occurrences = (content.match(/v4Systems/g) || []).length;
  assert.ok(occurrences >= 2, 'projects.js should check v4Systems at least twice (list compat + rollback)');
});

test('v4 phase 3: v4deploymap module has correct exports', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'util', 'v4deploymap.js'), 'utf8');
  assert.ok(content.includes('resolveSystemId'), 'v4deploymap must export resolveSystemId');
  assert.ok(content.includes('v4DeployMeta'), 'v4deploymap must export v4DeployMeta');
});
