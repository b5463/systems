'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
process.env.SYSTEMS_ATTESTATION_SECRET = 'health-test-attestation-secret-32-characters';
const attestation = require('../src/util/attestation');
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
test('route attestation verifies a fresh slug-bound envelope', async () => {
  stub(async (url) => {
    const nonce = new URL(url).searchParams.get('nonce');
    const now = Date.now();
    const body = attestation.seal({ slug: 'demo', nonce, issuedAt: now, expiresAt: now + 5000 });
    return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) };
  });
  const result = await health.checkAttestation('https://demo.example.test', 'demo');
  restore();
  assert.equal(result.state, 'verified');
  assert.equal(result.payload.slug, 'demo');
});

test('route attestation fails closed when ciphertext is altered', async () => {
  stub(async (url) => {
    const nonce = new URL(url).searchParams.get('nonce');
    const now = Date.now();
    const body = attestation.seal({ slug: 'demo', nonce, issuedAt: now, expiresAt: now + 5000 });
    const bytes = Buffer.from(body.ciphertext, 'base64url');
    bytes[0] ^= 1;
    body.ciphertext = bytes.toString('base64url');
    return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) };
  });
  const result = await health.checkAttestation('https://demo.example.test', 'demo');
  restore();
  assert.equal(result.state, 'failed');
});
