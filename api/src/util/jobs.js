'use strict';

// Pure job-queue policy helpers (V4 Phase 0) — no DB, no I/O, unit-testable.
//
// Retry schedule follows the V4 roadmap dead-letter policy: 3 attempts with
// exponential backoff (30s, 5m, 30m), then the job is parked as 'dead' and
// never auto-retried without operator investigation.

const BACKOFF_MS = Object.freeze([30_000, 300_000, 1_800_000]);

// attempt is 1-based: the number of attempts that have already failed.
function backoffMs(attempt) {
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  return BACKOFF_MS[Math.min(n, BACKOFF_MS.length) - 1];
}

/**
 * Decide what happens to a job after a failed attempt.
 * @param {{attempts: number, max_attempts: number}} job  state AFTER the attempt was counted
 * @returns {{status: 'dead'}|{status: 'pending', retryInMs: number}}
 */
function afterFailure(job) {
  const attempts = Number(job.attempts) || 0;
  const max = Number(job.max_attempts) || 3;
  if (attempts >= max) return { status: 'dead' };
  return { status: 'pending', retryInMs: backoffMs(attempts) };
}

// Per-type concurrency (V4 Phase 1). Job types are namespaced by their first
// dot segment ('build.image' → 'build'); each family has a hard cap from the
// roadmap. Unknown families get a conservative default.
const TYPE_CONCURRENCY = Object.freeze({
  build: 1,       // expand only after headroom measurement
  stripe: 3,      // reconciliation jobs
  email: 10,      // fulfilment
  analytics: 5,   // aggregation
  webhook: 20,    // retries
});
const DEFAULT_TYPE_CONCURRENCY = 5;

function typePrefix(jobType) {
  return String(jobType || '').split('.')[0];
}

function concurrencyFor(jobType) {
  return TYPE_CONCURRENCY[typePrefix(jobType)] ?? DEFAULT_TYPE_CONCURRENCY;
}

module.exports = {
  BACKOFF_MS, backoffMs, afterFailure,
  TYPE_CONCURRENCY, DEFAULT_TYPE_CONCURRENCY, typePrefix, concurrencyFor,
};
