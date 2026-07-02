'use strict';

// V4 Phase 0 — host-protection invariants. The roadmap requires confirming
// that existing protections stay active before V4 work increases write volume
// and operational risk. Each assertion pins a default that must not silently
// regress; the mechanisms themselves are covered in depth by their own suites
// (limits, build, diskhygiene, upload tests).

const { test } = require('node:test');
const assert = require('node:assert');

const { containerLimits } = require('../src/util/limits');
const { buildLimits, BuildGate } = require('../src/util/build');
const { mb, MAX_MULTIPART_BYTES, validateChunk, fitsOnDisk } = require('../src/util/upload');

test('invariant: deployed containers get bounded memory/CPU/PID/log limits by default', () => {
  const limits = containerLimits({}, {});
  assert.equal(limits.Memory, 512 * 1024 * 1024);
  assert.equal(limits.CpuQuota, 50_000); // 0.5 CPU on a 100ms period
  assert.equal(limits.PidsLimit, 256);
  assert.deepEqual(limits.LogConfig.Config, { 'max-size': '10m', 'max-file': '3' });
});

test('invariant: builds are capped (memory, CPU, concurrency 1 by default)', () => {
  const limits = buildLimits({});
  assert.equal(limits.memory, 1024 * 1024 * 1024);
  assert.equal(limits.memswap, limits.memory, 'no swap headroom beyond the memory cap');

  const gate = new BuildGate(() => Number(undefined) || 1);
  assert.equal(gate.tryAcquire('a'), true);
  assert.equal(gate.tryAcquire('b'), false, 'second concurrent build must queue');
});

test('invariant: uploads have explicit transport and total-size caps', () => {
  assert.equal(MAX_MULTIPART_BYTES, mb(500));
  assert.match(String(validateChunk({ index: 0, total: 1, chunkSize: 1, totalSize: mb(4096) })), /limit/);
});

test('invariant: disk admission requires free space plus a safety margin', () => {
  assert.equal(fitsOnDisk(mb(100), mb(700)), true);
  assert.equal(fitsOnDisk(mb(100), mb(500)), false, 'must reserve a margin beyond the upload size');
  assert.equal(fitsOnDisk(mb(100), NaN), false, 'unknown free space must deny admission');
});
