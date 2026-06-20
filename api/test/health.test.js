'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const health = require('../src/services/health');

const realFetch = global.fetch;

test('targetFor uses the host port in local mode even when a route is marked published', () => {
  const project = { slug: 'demo', port: 4000, route_published: 1 };
  assert.equal(health.targetFor(project, { LOCAL_MODE: 'true', BASE_DOMAIN: 'acronym.sk' }), 'http://127.0.0.1:4000');
});

test('targetFor infers local mode from a localhost base domain', () => {
  const project = { slug: 'demo', port: 4000, route_published: 1 };
  assert.equal(health.targetFor(project, { BASE_DOMAIN: 'localhost', PUBLIC_SCHEME: 'http' }), 'http://127.0.0.1:4000');
});

test('targetFor uses the public origin for a published route outside local mode', () => {
  const project = { slug: 'demo', port: 4000, route_published: 1 };
  assert.equal(health.targetFor(project, { PUBLIC_SCHEME: 'https', BASE_DOMAIN: 'example.test' }), 'https://demo.example.test');
});

test('targetFor falls back to the host port when no route is published', () => {
  const project = { slug: 'demo', port: 4000, route_published: 0 };
  assert.equal(health.targetFor(project, {}), 'http://127.0.0.1:4000');
});
function stub(fn) { global.fetch = fn; }
function restore() { global.fetch = realFetch; }

test('200 → healthy', async () => {
  stub(async () => ({ status: 200 }));
  const r = await health.checkSystem('demo.acronym.sk', '/');
  restore();
  assert.equal(r.state, 'healthy');
  assert.equal(r.httpStatus, 200);
});

test('500 → unhealthy', async () => {
  stub(async () => ({ status: 500 }));
  const r = await health.checkSystem('demo.acronym.sk', '/');
  restore();
  assert.equal(r.state, 'unhealthy');
  assert.equal(r.httpStatus, 500);
});

test('abort → timeout', async () => {
  stub(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
  const r = await health.checkSystem('demo.acronym.sk', '/');
  restore();
  assert.equal(r.state, 'timeout');
  assert.equal(r.httpStatus, null);
});

test('connection error → unreachable', async () => {
  stub(async () => { const e = new Error('refused'); e.cause = { code: 'ECONNREFUSED' }; throw e; });
  const r = await health.checkSystem('demo.acronym.sk', '/');
  restore();
  assert.equal(r.state, 'unreachable');
});
