'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { GENESIS, hashEntry, verifyChain } = require('../src/util/audit');

// Build a valid hash chain the same way db/index.js does.
function buildChain(entries) {
  const rows = [];
  let prev = GENESIS;
  let id = 1;
  for (const e of entries) {
    const row = { id: id++, user_id: null, action: e.action, target: e.target ?? null, detail: e.detail ?? null, ip: e.ip ?? null, created_at: e.created_at };
    row.prev_hash = prev;
    row.hash = hashEntry(prev, row);
    prev = row.hash;
    rows.push(row);
  }
  return rows;
}

const sample = [
  { action: 'login', target: 'admin', created_at: '2026-01-01T00:00:00Z' },
  { action: 'deploy', target: 'notes', created_at: '2026-01-01T00:01:00Z' },
  { action: 'visibility_change', target: 'notes', detail: 'private', created_at: '2026-01-01T00:02:00Z' },
];

test('a well-formed chain verifies', () => {
  const r = verifyChain(buildChain(sample));
  assert.equal(r.ok, true);
  assert.equal(r.verified, 3);
  assert.equal(r.brokenAtId, null);
});

test('verification is order-independent (rows sorted by id)', () => {
  const rows = buildChain(sample);
  const r = verifyChain([rows[2], rows[0], rows[1]]);
  assert.equal(r.ok, true);
});

test('detects a modified row', () => {
  const rows = buildChain(sample);
  rows[1].detail = 'tampered'; // content changed, hash not recomputed
  const r = verifyChain(rows);
  assert.equal(r.ok, false);
  assert.equal(r.brokenAtId, 2);
  assert.match(r.reason, /content/);
});

test('detects a removed middle row (broken linkage)', () => {
  const rows = buildChain(sample);
  rows.splice(1, 1); // drop the 2nd row; row 3 now links to a gone hash
  const r = verifyChain(rows);
  assert.equal(r.ok, false);
  assert.equal(r.brokenAtId, 3);
  assert.match(r.reason, /linkage/);
});

test('detects a forged inserted row', () => {
  const rows = buildChain(sample);
  const forged = { id: 99, user_id: null, action: 'grant', target: 'evil', detail: null, ip: null, created_at: '2026-01-01T00:03:00Z', prev_hash: rows[2].hash, hash: 'deadbeef' };
  const r = verifyChain([...rows, forged]);
  assert.equal(r.ok, false);
  assert.equal(r.brokenAtId, 99);
});

test('an empty / unhashed legacy log is treated as ok (nothing to verify)', () => {
  assert.equal(verifyChain([]).ok, true);
  const legacy = [{ id: 1, action: 'login', created_at: '2025-01-01T00:00:00Z', hash: null, prev_hash: null }];
  assert.equal(verifyChain(legacy).ok, true);
});

test('verifies only from the first hashed row (post-migration boundary)', () => {
  const hashed = buildChain(sample);
  const legacy = { id: 0, action: 'old', created_at: '2024-01-01T00:00:00Z', hash: null, prev_hash: null };
  const r = verifyChain([legacy, ...hashed]);
  assert.equal(r.ok, true);
  assert.equal(r.verified, 3);
});
