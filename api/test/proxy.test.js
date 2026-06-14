'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const proxy = require('../src/services/proxy');

test('kind() defaults to nginx', () => {
  delete process.env.REVERSE_PROXY;
  assert.equal(proxy.kind(), 'nginx');
});

test('kind() respects REVERSE_PROXY=caddy', () => {
  process.env.REVERSE_PROXY = 'caddy';
  assert.equal(proxy.kind(), 'caddy');
  delete process.env.REVERSE_PROXY;
});
