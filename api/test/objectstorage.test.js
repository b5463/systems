'use strict';

const crypto = require('crypto');
const { test } = require('node:test');
const assert = require('node:assert');

const { sigV4SigningKey, encodeS3Key } = require('../src/services/objectstorage');

// The SigV4 signing key chain MUST be date -> region -> service ->
// 'aws4_request'. Assert the helper matches a spelled-out correct reference,
// and — critically — does NOT match the reversed chain that was the shipped
// bug (which made every S3 PUT fail with SignatureDoesNotMatch).
test('sigV4 signing key uses the correct date->region->service order', () => {
  const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  const [date, region, service] = ['20150830', 'us-east-1', 's3'];

  const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
  const correct = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), 'aws4_request');
  const reversed = hmac(hmac(hmac(hmac(`AWS4${secret}`, 'aws4_request'), service), region), date);

  const got = Buffer.from(sigV4SigningKey(secret, date, region, service));
  assert.equal(got.toString('hex'), Buffer.from(correct).toString('hex'), 'matches the correct chain');
  assert.notEqual(got.toString('hex'), Buffer.from(reversed).toString('hex'), 'must not match the reversed (buggy) chain');
});

test('encodeS3Key preserves slashes but percent-encodes segments', () => {
  assert.equal(encodeS3Key('backups/2026-06-15/platform.pgdump'), 'backups/2026-06-15/platform.pgdump');
  assert.equal(encodeS3Key('a b/c+d'), 'a%20b/c%2Bd');
});
