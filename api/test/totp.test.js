'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const totp = require('../src/util/totp');

test('totp: base32 round-trips', () => {
  const buf = Buffer.from('Hello SYSTEMS!');
  assert.deepEqual(totp.base32Decode(totp.base32Encode(buf)), buf);
});

test('totp: RFC 6238 known vector (SHA1, T=59)', () => {
  // RFC 6238 test seed "12345678901234567890" -> base32, time 59s, 8 digits
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  const code = totp.totp(secret, { time: 59 * 1000, digits: 8 });
  assert.equal(code, '94287082');
});

test('totp: verify accepts current code, rejects garbage', () => {
  const secret = totp.generateSecret();
  const now = Date.now();
  const code = totp.totp(secret, { time: now });
  assert.equal(totp.verify(code, secret, { time: now }), true);
  assert.equal(totp.verify('000000', secret, { time: now }), false);
  assert.equal(totp.verify('not-a-code', secret, { time: now }), false);
  assert.equal(totp.verify('', secret), false);
});

test('totp: verify tolerates one step of clock skew', () => {
  const secret = totp.generateSecret();
  const t = Date.now();
  const prev = totp.totp(secret, { time: t - 30000 });
  assert.equal(totp.verify(prev, secret, { time: t, window: 1 }), true);
  assert.equal(totp.verify(prev, secret, { time: t, window: 0 }), false);
});

test('totp: otpauth url shape', () => {
  const url = totp.otpauthURL('JBSWY3DPEHPK3PXP', { label: 'admin', issuer: 'SYSTEMS.' });
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.match(url, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(url, /issuer=SYSTEMS/);
});
