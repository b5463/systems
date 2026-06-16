'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

// ENV_SECRET must exist before the module derives its key.
process.env.ENV_SECRET = 'test-env-secret-please-change';
const { encryptEnvVars, decryptEnvVars } = require('../src/routes/env');

test('env crypto: AES-256-GCM round-trips', () => {
  const vars = { NODE_ENV: 'production', PORT: '3000', TOKEN: 's3cr3t/value=' };
  const blob = encryptEnvVars(vars);
  // ciphertext is opaque JSON, not the plaintext
  assert.ok(!blob.includes('s3cr3t'));
  assert.deepEqual(decryptEnvVars(blob), vars);
})

test('env crypto: tampered ciphertext fails the auth tag', () => {
  const blob = JSON.parse(encryptEnvVars({ A: 'b' }));
  blob.data = blob.data.replace(/.$/, (c) => (c === 'f' ? 'e' : 'f'));
  assert.throws(() => decryptEnvVars(JSON.stringify(blob)));
})
