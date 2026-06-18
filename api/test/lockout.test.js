'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { freshState, check, onFailure, onSuccess } = require('../src/util/lockout');

const opts = { threshold: 3, windowMs: 10_000, baseLockMs: 1000, factor: 2, maxLockMs: 8000 };

test('fresh key is not locked', () => {
  assert.equal(check(undefined, 1000).locked, false);
  assert.equal(check(freshState(), 1000).locked, false);
});

test('locks after `threshold` consecutive failures', () => {
  let s, now = 0;
  for (let i = 0; i < 3; i++) s = onFailure(s, (now += 100), opts);
  const r = check(s, now);
  assert.equal(r.locked, true);
  assert.equal(r.retryAfterMs, 1000); // baseLockMs
});

test('stays unlocked just below the threshold', () => {
  let s, now = 0;
  s = onFailure(s, (now += 100), opts);
  s = onFailure(s, (now += 100), opts);
  assert.equal(check(s, now).locked, false);
});

test('unlocks once the lock window passes', () => {
  let s, now = 0;
  for (let i = 0; i < 3; i++) s = onFailure(s, (now += 100), opts);
  assert.equal(check(s, now + 999).locked, true);
  assert.equal(check(s, now + 1001).locked, false);
});

test('successive locks back off exponentially and cap', () => {
  let s, now = 0;
  const lockOnce = () => { for (let i = 0; i < 3; i++) s = onFailure(s, (now += 1), opts); };
  lockOnce(); assert.equal(s.lockedUntil - now, 1000); // 1st: base
  lockOnce(); assert.equal(s.lockedUntil - now, 2000); // 2nd: base*2
  lockOnce(); assert.equal(s.lockedUntil - now, 4000); // 3rd: base*4
  lockOnce(); assert.equal(s.lockedUntil - now, 8000); // 4th: base*8 == cap
  lockOnce(); assert.equal(s.lockedUntil - now, 8000); // 5th: capped at maxLockMs
});

test('a stale failure streak is forgotten after windowMs', () => {
  let s, now = 0;
  s = onFailure(s, (now += 100), opts);
  s = onFailure(s, (now += 100), opts); // 2 fails
  now += opts.windowMs + 1;             // long gap
  s = onFailure(s, now, opts);          // streak resets → this is fail #1, not #3
  assert.equal(check(s, now).locked, false);
  assert.equal(s.fails, 1);
});

test('onSuccess clears the lock state', () => {
  let s, now = 0;
  for (let i = 0; i < 3; i++) s = onFailure(s, (now += 100), opts);
  assert.equal(check(s, now).locked, true);
  s = onSuccess();
  assert.equal(check(s, now).locked, false);
});
