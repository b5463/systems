'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isValidSlug, isReserved, slugError } = require('../src/util/slug');

test('accepts valid slugs', () => {
  for (const s of ['notes', 'ab', 'my-app', 'a1', 'good-app-2']) {
    assert.equal(isValidSlug(s), true, `${s} should be valid`);
    assert.equal(slugError(s), null);
  }
});

test('rejects invalid slugs', () => {
  for (const s of ['a', 'A', 'Notes', '-bad', 'bad-', 'my--app', 'has space', 'under_score', 'x'.repeat(51), '', 'café']) {
    assert.equal(isValidSlug(s), false, `${s} should be invalid`);
    assert.ok(slugError(s));
  }
});

test('rejects reserved names', () => {
  for (const s of ['www', 'api', 'admin', 'dashboard', 'server', 'system', 'systems', 'auth', 'login', 'proxy', 'docker', 'caddy']) {
    assert.equal(isReserved(s), true, `${s} should be reserved`);
    assert.match(slugError(s), /reserved/);
  }
});

test('reserved check is case-insensitive', () => {
  assert.equal(isReserved('ADMIN'), true);
});
