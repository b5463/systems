'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildLimits, BuildGate } = require('../src/util/build');

test('build limits have bounded defaults', () => {
  const limits = buildLimits({});
  assert.equal(limits.memory, 1024 * 1024 * 1024);
  assert.equal(limits.memswap, limits.memory);
  assert.equal(limits.cpuperiod, 100000);
  assert.equal(limits.cpuquota, 100000);
});

test('build limits honor configured memory and CPU', () => {
  const limits = buildLimits({ BUILD_MEMORY_MB: '2048', BUILD_CPU_LIMIT: '1.5' });
  assert.equal(limits.memory, 2048 * 1024 * 1024);
  assert.equal(limits.cpuquota, 150000);
});

test('build gate enforces its cap and releases capacity', () => {
  const gate = new BuildGate(() => 2);
  assert.equal(gate.tryAcquire('one'), true);
  assert.equal(gate.tryAcquire('two'), true);
  assert.equal(gate.tryAcquire('three'), false);
  assert.equal(gate.tryAcquire('one'), false);
  gate.release('one');
  assert.equal(gate.tryAcquire('three'), true);
  assert.equal(gate.count(), 2);
});