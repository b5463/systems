'use strict';

// Pure login lockout / backoff decision logic. The caller owns the per-key
// state (e.g. an in-memory Map keyed by client IP); these functions only
// compute the next state and whether a key is currently locked. No timers, no
// I/O, so it unit-tests cleanly.
//
// This complements the per-IP rate limit: rate limiting caps request *rate*,
// lockout adds escalating backoff after repeated *credential failures*.

const DEFAULTS = {
  threshold: 5,            // consecutive failures before a lock kicks in
  windowMs: 15 * 60_000,   // failures older than this are forgotten
  baseLockMs: 60_000,      // first lock duration (1 min)
  factor: 2,               // each subsequent lock multiplies the duration …
  maxLockMs: 30 * 60_000,  // … capped at 30 min
};

function freshState() {
  return { fails: 0, lockCount: 0, lastFailAt: 0, lockedUntil: 0 };
}

/** Is this key currently locked? → { locked, retryAfterMs }. */
function check(state, now) {
  if (state && state.lockedUntil > now) {
    return { locked: true, retryAfterMs: state.lockedUntil - now };
  }
  return { locked: false, retryAfterMs: 0 };
}

/** Record a failed attempt; returns the new state (does not mutate the input). */
function onFailure(state, now, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const s = state ? { ...state } : freshState();

  // Forget a stale failure streak so an old, abandoned attempt doesn't
  // accumulate toward a lock weeks later.
  if (s.lastFailAt && now - s.lastFailAt > o.windowMs) {
    s.fails = 0;
    s.lockCount = 0;
  }

  s.fails += 1;
  s.lastFailAt = now;

  if (s.fails >= o.threshold) {
    s.lockCount += 1;
    const dur = Math.min(o.maxLockMs, o.baseLockMs * Math.pow(o.factor, s.lockCount - 1));
    s.lockedUntil = now + dur;
    s.fails = 0; // start a fresh streak after locking
  }
  return s;
}

/** A successful login clears the state for that key. */
function onSuccess() {
  return freshState();
}

module.exports = { DEFAULTS, freshState, check, onFailure, onSuccess };
