'use strict';

// V4 Phase 4 — domain verification + route publication state machine.
//
// Pure logic (no DB, no network) so it unit-tests without a host. The DNS
// lookup used by verification is injected, and the route publication
// transaction takes its Caddy write/validate/reload/probe steps as injected
// deps — production wires the real ones, tests pass fakes.

const crypto = require('crypto');

// ── Route publication state machine ─────────────────────────────────────────
// Statuses a route (an environment↔domain mapping) moves through. `active` is
// only ever reached after a probe passes; a Caddy reload/probe failure lands on
// `failed` and never silently on `active`.
const ROUTE_STATUSES = ['inactive', 'pending', 'active', 'failed', 'superseded'];

const ROUTE_TRANSITIONS = {
  inactive: ['pending', 'superseded'],
  pending: ['active', 'failed'],
  active: ['pending', 'superseded', 'failed'],
  failed: ['pending', 'superseded'],
  superseded: ['pending'],
};

function canTransitionRoute(from, to) {
  if (!ROUTE_STATUSES.includes(to)) return false;
  if (from == null) return to === 'inactive' || to === 'pending';
  return (ROUTE_TRANSITIONS[from] || []).includes(to);
}

// ── Custom-domain verification ──────────────────────────────────────────────
const VERIFY_TOKEN_BYTES = 32; // 256 bits of entropy (roadmap Phase 9)
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000; // 48h expiry
const VERIFY_RECORD_PREFIX = '_systems-verify';

// Generate a verification token + the exact DNS record the operator must add.
// `now` is injected (scripts can't call Date.now in some contexts) — default to
// wall clock here since this is request-time code, not a workflow script.
function generateVerification(hostname, now = Date.now()) {
  const token = crypto.randomBytes(VERIFY_TOKEN_BYTES).toString('hex');
  return {
    token,
    method: 'dns-txt',
    expiresAt: new Date(now + VERIFY_TTL_MS),
    record: verificationRecord(hostname, token),
  };
}

// The TXT record the operator adds to prove control of the hostname.
function verificationRecord(hostname, token) {
  return {
    type: 'TXT',
    name: `${VERIFY_RECORD_PREFIX}.${hostname}`,
    value: `systems-verify=${token}`,
  };
}

function isVerificationExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return true;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return !Number.isFinite(t) || t < now;
}

// Check DNS ownership. `resolveTxt` is injected (dns.promises.resolveTxt in
// production) and returns string[][] like Node's resolver. Returns a structured
// result — never throws — so callers can record last_error and stay on 'failed'
// rather than 500. Uses a timing-safe compare on the token.
async function checkDnsVerification({ hostname, token, expiresAt, resolveTxt, now = Date.now() }) {
  if (!token) return { verified: false, reason: 'no_pending_verification' };
  if (isVerificationExpired(expiresAt, now)) return { verified: false, reason: 'verification_expired' };

  const recordName = `${VERIFY_RECORD_PREFIX}.${hostname}`;
  const expected = `systems-verify=${token}`;
  let records;
  try {
    records = await resolveTxt(recordName);
  } catch (err) {
    // NXDOMAIN / no records yet — not an error the operator can't fix.
    return { verified: false, reason: 'record_not_found', detail: err && err.code };
  }
  // resolveTxt returns chunked TXT strings per record; join chunks per record.
  const values = (records || []).map((chunks) => (Array.isArray(chunks) ? chunks.join('') : String(chunks)));
  const match = values.some((v) => timingSafeEqualStr(v.trim(), expected));
  return match
    ? { verified: true }
    : { verified: false, reason: 'token_mismatch' };
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Module-level TXT resolver so routes can call checkDnsVerification without
// wiring dns everywhere, and tests can stub it deterministically.
let _resolveTxt = null;
function resolveTxt(name) {
  const fn = _resolveTxt || require('dns').promises.resolveTxt;
  return fn(name);
}
function setResolver(fn) { _resolveTxt = fn; } // test hook; pass null to restore

module.exports = {
  ROUTE_STATUSES,
  ROUTE_TRANSITIONS,
  canTransitionRoute,
  VERIFY_TTL_MS,
  generateVerification,
  verificationRecord,
  isVerificationExpired,
  checkDnsVerification,
  resolveTxt,
  setResolver,
};
