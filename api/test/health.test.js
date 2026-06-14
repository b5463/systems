'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const health = require('../src/services/health');

const realFetch = global.fetch;
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
