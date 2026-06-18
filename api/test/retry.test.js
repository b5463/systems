'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { retry, computeDelay } = require('../src/util/retry');

const noSleep = () => Promise.resolve();

test('returns immediately on first success', async () => {
  let calls = 0;
  const out = await retry(() => { calls++; return 'ok'; }, { sleep: noSleep });
  assert.equal(out, 'ok');
  assert.equal(calls, 1);
});

test('retries then succeeds', async () => {
  let calls = 0;
  const out = await retry(() => {
    calls++;
    if (calls < 3) throw new Error('transient');
    return 'ok';
  }, { retries: 5, sleep: noSleep });
  assert.equal(out, 'ok');
  assert.equal(calls, 3);
});

test('gives up after `retries` extra attempts and rethrows last error', async () => {
  let calls = 0;
  await assert.rejects(
    retry(() => { calls++; throw new Error(`fail-${calls}`); }, { retries: 2, sleep: noSleep }),
    /fail-3/,
  );
  assert.equal(calls, 3); // 1 initial + 2 retries
});

test('stops early when shouldRetry returns false', async () => {
  let calls = 0;
  await assert.rejects(
    retry(() => { calls++; throw new Error('permanent'); }, {
      retries: 5,
      shouldRetry: (err) => !/permanent/.test(err.message),
      sleep: noSleep,
    }),
    /permanent/,
  );
  assert.equal(calls, 1);
});

test('backoff grows exponentially, caps at maxMs, no jitter is deterministic', () => {
  const opts = { baseMs: 100, factor: 2, maxMs: 1000, jitter: false };
  assert.equal(computeDelay(0, opts, () => 0), 100);
  assert.equal(computeDelay(1, opts, () => 0), 200);
  assert.equal(computeDelay(2, opts, () => 0), 400);
  assert.equal(computeDelay(4, opts, () => 0), 1000); // capped
});

test('full jitter stays within [50%, 100%] of the raw delay', () => {
  const opts = { baseMs: 100, factor: 2, maxMs: 1000, jitter: true };
  assert.equal(computeDelay(1, opts, () => 0), 100); // 200 * 0.5
  assert.equal(computeDelay(1, opts, () => 1), 200); // 200 * 1.0
});

test('passes the attempt number to fn', async () => {
  const seen = [];
  await retry((attempt) => { seen.push(attempt); if (attempt < 2) throw new Error('x'); return 'ok'; }, { retries: 3, sleep: noSleep });
  assert.deepEqual(seen, [0, 1, 2]);
});
