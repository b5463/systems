'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'systems-attestation-route-'));
process.env.DATA_DIR = dir;
process.env.SYSTEMS_DATA_DIR = dir;
process.env.JWT_SECRET = 'attestation-route-test-jwt-secret-long-enough';
process.env.SYSTEMS_ATTESTATION_SECRET = 'attestation-route-test-secret-long-enough';

const { prisma, hasDb, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('attestation route (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
  return;
}

const { buildApp } = require('../src/app');
const attestation = require('../src/util/attestation');

test('internal attestation requires the proxy credential and returns a bound encrypted envelope', async (t) => {
  await resetDb();
  await prisma.project.create({
    data: {
      name: 'Attested system', slug: 'attested', status: 'running',
      imageId: 'sha256:image-id', deployType: 'static',
      healthState: 'healthy', healthStatus: 200, healthCheckedAt: new Date().toISOString(),
    },
  });
  const app = await buildApp({ logger: false });
  t.after(async () => {
    await app.close();
    await prisma.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const nonce = attestation.newNonce();
  const missing = await app.inject({ method: 'GET', url: `/api/internal/attestation/attested?nonce=${nonce}` });
  assert.equal(missing.statusCode, 404);

  const response = await app.inject({
    method: 'GET',
    url: `/api/internal/attestation/attested?nonce=${nonce}`,
    headers: { 'x-systems-route-credential': attestation.routeCredential('attested') },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const payload = attestation.open(response.json(), { slug: 'attested', nonce });
  assert.equal(payload.observed.health, 'healthy');
  assert.equal(payload.observed.httpStatus, 200);
  assert.equal(payload.deployment.type, 'static');
  assert.notEqual(payload.deployment.fingerprint, 'sha256:image-id');
});
