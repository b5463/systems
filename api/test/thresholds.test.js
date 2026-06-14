'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { diskTone, backupOverdue, confirmMatches } = require('../src/util/thresholds');

test('diskTone: 75/90 thresholds', () => {
  assert.equal(diskTone(10), 'ok');
  assert.equal(diskTone(74.9), 'ok');
  assert.equal(diskTone(75), 'warn');
  assert.equal(diskTone(89.9), 'warn');
  assert.equal(diskTone(90), 'error');
  assert.equal(diskTone(null), 'idle');
});

test('backupOverdue: >7 days', () => {
  assert.equal(backupOverdue(5), false);
  assert.equal(backupOverdue(168), false);
  assert.equal(backupOverdue(169), true);
  assert.equal(backupOverdue(NaN), false);
});

test('confirmMatches: exact slug only', () => {
  assert.equal(confirmMatches('notes', 'notes'), true);
  assert.equal(confirmMatches('Notes', 'notes'), false);
  assert.equal(confirmMatches('', ''), false);   // never match empty
  assert.equal(confirmMatches(undefined, 'notes'), false);
  assert.equal(confirmMatches('notes ', 'notes'), false);
});
