'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isWithin, safeResolve } = require('../src/util/pathsafe');

const DEST = '/tmp/extract-root';

test('allows safe entries', () => {
  for (const p of ['index.html', 'src/app.js', 'a/b/c.txt', './dist/x.js']) {
    assert.equal(isWithin(DEST, p), true, `${p} should be within`);
  }
});

test('rejects traversal entries', () => {
  for (const p of ['../escape.txt', '../../etc/passwd', 'a/../../b', '/etc/passwd', 'a/../../../root']) {
    assert.equal(isWithin(DEST, p), false, `${p} should be rejected`);
    assert.equal(safeResolve(DEST, p), null);
  }
});
