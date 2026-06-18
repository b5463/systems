'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { imagesToPrune, releasesToPrune } = require('../src/util/diskhygiene');

test('imagesToPrune keeps referenced (rollback) images, returns the rest', () => {
  const images = [{ Id: 'a' }, { Id: 'b' }, { Id: 'c' }, { Id: 'd' }];
  const referenced = ['a', 'c']; // current + previous in use
  assert.deepEqual(imagesToPrune(images, referenced).sort(), ['b', 'd']);
});

test('imagesToPrune handles empty / malformed input', () => {
  assert.deepEqual(imagesToPrune([], ['x']), []);
  assert.deepEqual(imagesToPrune(null, null), []);
  assert.deepEqual(imagesToPrune([{}, { Id: 'a' }], []), ['a']);
});

test('releasesToPrune keeps the newest N', () => {
  const dirs = [
    { name: 'r1', mtimeMs: 100 },
    { name: 'r2', mtimeMs: 200 },
    { name: 'r3', mtimeMs: 300 },
    { name: 'r4', mtimeMs: 400 },
  ];
  // keep 2 newest (r4, r3) → prune r2, r1
  assert.deepEqual(releasesToPrune(dirs, 2, []).sort(), ['r1', 'r2']);
});

test('releasesToPrune never prunes a referenced rollback release even if old', () => {
  const dirs = [
    { name: 'r1', mtimeMs: 100 }, // oldest, but referenced
    { name: 'r2', mtimeMs: 200 },
    { name: 'r3', mtimeMs: 300 },
    { name: 'r4', mtimeMs: 400 },
  ];
  assert.deepEqual(releasesToPrune(dirs, 2, ['r1']), ['r2']);
});

test('releasesToPrune keeps at least 1 even with retention 0', () => {
  const dirs = [{ name: 'a', mtimeMs: 1 }, { name: 'b', mtimeMs: 2 }];
  assert.deepEqual(releasesToPrune(dirs, 0, []), ['a']);
});
