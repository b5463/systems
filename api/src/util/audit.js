'use strict';

// Tamper-evident audit log helpers (pure — no DB, no I/O, so they unit-test
// without native modules).
//
// Each audit row carries `prev_hash` (the hash of the previous row) and `hash`
// (a SHA-256 over prev_hash + the row's own immutable fields). That forms a
// hash chain: changing, reordering, or inserting a row anywhere in the middle
// breaks every hash after it, which `verifyChain` detects. It is *evidence of*
// tampering, not prevention — an attacker with write access can recompute the
// chain, but cannot alter history silently for anyone who has seen an earlier
// hash (e.g. an exported/offsite copy).
//
// Retention pruning deletes the oldest rows; the earliest retained row's
// `prev_hash` then points at a removed row, which is expected. Verification
// treats the first retained row's `prev_hash` as a trusted anchor and checks
// the contiguous chain from there forward.

const crypto = require('crypto');

const GENESIS = '0'.repeat(64);

// Deterministic serialization of the immutable fields. Array form (not an
// object) so key ordering can never change the bytes we hash.
function canonical(entry) {
  return JSON.stringify([
    entry.id ?? null,
    entry.user_id ?? null,
    entry.action ?? null,
    entry.target ?? null,
    entry.detail ?? null,
    entry.ip ?? null,
    entry.created_at ?? null,
  ]);
}

function hashEntry(prevHash, entry) {
  return crypto
    .createHash('sha256')
    .update(String(prevHash) + '|' + canonical(entry))
    .digest('hex');
}

/**
 * Verify a hash-chained audit log.
 * @param {Array<object>} rows  audit rows, each with id, hash, prev_hash and the
 *                              immutable fields. Order does not matter; sorted by id here.
 * @returns {{ok: boolean, total: number, verified: number, brokenAtId: number|null, reason: string|null}}
 */
function verifyChain(rows) {
  const sorted = [...rows].sort((a, b) => a.id - b.id);

  // Legacy rows written before hashing have no hash; skip them and verify from
  // the first hashed row onward.
  const start = sorted.findIndex((r) => r.hash);
  if (start === -1) {
    return { ok: true, total: sorted.length, verified: 0, brokenAtId: null, reason: null };
  }

  let verified = 0;
  let prevHashOfPrevRow = null; // hash of the previous *verified* row
  for (let i = start; i < sorted.length; i++) {
    const row = sorted[i];

    if (!row.hash) {
      return { ok: false, total: sorted.length, verified, brokenAtId: row.id, reason: 'missing hash' };
    }

    // Linkage: every row after the anchor must point at the previous row's hash.
    if (prevHashOfPrevRow !== null && row.prev_hash !== prevHashOfPrevRow) {
      return { ok: false, total: sorted.length, verified, brokenAtId: row.id, reason: 'broken linkage (row removed or reordered)' };
    }

    // Content integrity: recompute and compare.
    if (hashEntry(row.prev_hash, row) !== row.hash) {
      return { ok: false, total: sorted.length, verified, brokenAtId: row.id, reason: 'content modified' };
    }

    verified++;
    prevHashOfPrevRow = row.hash;
  }

  return { ok: true, total: sorted.length, verified, brokenAtId: null, reason: null };
}

module.exports = { GENESIS, canonical, hashEntry, verifyChain };
