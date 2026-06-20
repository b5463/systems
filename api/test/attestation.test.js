'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SYSTEMS_ATTESTATION_SECRET = 'test-attestation-secret-32-characters-minimum';
const attestation = require('../src/util/attestation');
const nginx = require('../src/services/nginx');

test('attestation envelope round-trips and binds slug + nonce', () => {
  const now = Date.now();
  const nonce = attestation.newNonce();
  const envelope = attestation.seal({ slug: 'demo', nonce, issuedAt: now, expiresAt: now + 5000 });
  const payload = attestation.open(envelope, { slug: 'demo', nonce }, process.env, now + 1);
  assert.equal(payload.slug, 'demo');
  assert.throws(() => attestation.open(envelope, { slug: 'other', nonce }, process.env, now + 1), /slug mismatch/);
  assert.throws(() => attestation.open(envelope, { slug: 'demo', nonce: attestation.newNonce() }, process.env, now + 1), /nonce mismatch/);
});

test('attestation rejects ciphertext tampering and replay after expiry', () => {
  const now = Date.now();
  const nonce = attestation.newNonce();
  const envelope = attestation.seal({ slug: 'demo', nonce, issuedAt: now, expiresAt: now + 5000 });
  const bytes = Buffer.from(envelope.ciphertext, 'base64url');
  bytes[0] ^= 1;
  assert.throws(() => attestation.open({ ...envelope, ciphertext: bytes.toString('base64url') }, { slug: 'demo', nonce }, process.env, now + 1), /invalid attestation/);
  assert.throws(() => attestation.open(envelope, { slug: 'demo', nonce }, process.env, now + 5001), /expired attestation/);
});

test('route credentials are scoped per slug and compared safely', () => {
  const a = attestation.routeCredential('alpha');
  const b = attestation.routeCredential('beta');
  assert.notEqual(a, b);
  assert.equal(attestation.validCredential('alpha', a), true);
  assert.equal(attestation.validCredential('alpha', b), false);
});

test('nginx reserves the attestation path before the uploaded app route', () => {
  const out = nginx.renderProjectRoute('demo', 4000);
  assert.match(out, /location = \/demo\/\.well-known\/systems\/v1\/attestation/);
  assert.match(out, /proxy_pass http:\/\/acronym-api:3000\/api\/internal\/attestation\/demo\$is_args\$args/);
  assert.match(out, /X-Systems-Route-Credential [A-Za-z0-9_-]{43}/);
  assert.match(out, /location \/demo\//);
});
