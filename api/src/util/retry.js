'use strict';

// Small retry-with-exponential-backoff helper for transient external calls
// (outbound webhooks, proxy reloads). Pure control flow with an injectable
// sleep so it unit-tests without real timers.
//
//   await retry(() => fetch(...), { retries: 3, baseMs: 200 })
//
// Backoff is base * factor^attempt, capped at maxMs, with optional full jitter.
// `shouldRetry(err)` lets callers stop early on non-transient errors.

function computeDelay(attempt, { baseMs, factor, maxMs, jitter }, rand) {
  const raw = Math.min(maxMs, baseMs * Math.pow(factor, attempt));
  return jitter ? Math.floor(raw * (0.5 + rand() * 0.5)) : raw;
}

async function retry(fn, opts = {}) {
  const {
    retries = 3,
    baseMs = 200,
    factor = 2,
    maxMs = 5000,
    jitter = true,
    shouldRetry = () => true,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    rand = Math.random,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err, attempt)) break;
      await sleep(computeDelay(attempt, { baseMs, factor, maxMs, jitter }, rand));
    }
  }
  throw lastErr;
}

module.exports = { retry, computeDelay };
