'use strict';

// V4 Phase 2.5 — migration reconciliation checkpoint: the script must pass on
// freshly bridged data, and must catch unmapped projects, field drift, and
// env-var decryption failures. Host-dependent checks (Docker, Caddy) report
// not_measured in this environment.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

// ENV_SECRET must exist before routes/env derives its key (decrypt checks).
process.env.ENV_SECRET = process.env.ENV_SECRET || 'test-env-secret-please-change';

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 phase 2.5 tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
  return;
}

const { migrateProjects } = require('../scripts/migrate-projects-to-v4');
const { reconcileV4 } = require('../scripts/reconcile-v4-migration');
const { encryptEnvVars } = require('../src/routes/env');
const { orgRepo } = require('../src/repo');
const { buildApp } = require('../src/app');

let app;
let cookie;
let csrf;
let org;

const auth = () => ({ cookie, 'x-csrf-token': csrf });

before(async () => {
  await resetDb();
  app = await buildApp();
  await app.ready();
  org = await orgRepo.ensureDefault();

  await prisma.user.create({
    data: { username: 'root', passwordHash: bcrypt.hashSync('correct-horse-battery', 12) },
  });
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { username: 'root', password: 'correct-horse-battery' },
  });
  cookie = login.headers['set-cookie'].split(';')[0];
  csrf = login.json().csrfToken;

  await prisma.project.create({
    data: {
      name: 'Shop', slug: 'shop', status: 'running', deployType: 'node',
      containerId: 'c-current', imageId: 'img-current', port: 34001,
      envVars: encryptEnvVars({ API_KEY: 'secret-value' }),
    },
  });
  await prisma.project.create({
    data: { name: 'Blog', slug: 'blog', status: 'stopped', deployType: 'static' },
  });
  await migrateProjects({ prisma, organisationId: org.id });
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

test('reconcile: passes on freshly bridged data', async () => {
  const report = await reconcileV4({ prisma });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.equal(report.projects.mapped, 2);
  assert.deepEqual(report.projects.unmapped, []);
  assert.deepEqual(report.drift, []);
  assert.deepEqual(report.missingDomains, []);
  assert.equal(report.envSecrets.checked, 1);
  assert.deepEqual(report.envSecrets.failures, []);
  assert.ok(['measured', 'not_measured'].includes(report.docker.status));
});

test('reconcile: catches a project created after the bridge, clean after re-run', async () => {
  await prisma.project.create({ data: { name: 'New App', slug: 'new-app', status: 'stopped' } });

  let report = await reconcileV4({ prisma });
  assert.equal(report.ok, false);
  assert.deepEqual(report.projects.unmapped, ['new-app']);

  await migrateProjects({ prisma, organisationId: org.id });
  report = await reconcileV4({ prisma });
  assert.equal(report.ok, true);
  assert.equal(report.projects.mapped, 3);
});

test('reconcile: detects field drift between projects and their V4 copy', async () => {
  await prisma.project.update({
    where: { slug: 'blog' },
    data: { name: 'Blog Renamed', visibility: 'private' },
  });

  const report = await reconcileV4({ prisma });
  assert.equal(report.ok, false);
  const drifted = report.drift.find((d) => d.slug === 'blog');
  assert.ok(drifted, 'blog must be reported as drifted');
  assert.deepEqual(drifted.fields.sort(), ['name', 'visibility']);

  // Repair: align the V4 copy again (what a bridge refresh would do).
  const map = await prisma.legacyProjectMap.findFirst({ where: { projectId: (await prisma.project.findUnique({ where: { slug: 'blog' } })).id } });
  await prisma.system.update({ where: { id: map.systemId }, data: { name: 'Blog Renamed' } });
  await prisma.systemEnvironment.update({ where: { id: map.environmentId }, data: { accessPolicy: 'private' } });
  assert.equal((await reconcileV4({ prisma })).ok, true);
});

test('reconcile: detects env vars that no longer decrypt', async () => {
  await prisma.project.update({
    where: { slug: 'shop' },
    data: { envVars: '{"iv":"00","tag":"00","data":"deadbeef"}' },
  });

  const report = await reconcileV4({ prisma });
  assert.equal(report.ok, false);
  assert.deepEqual(report.envSecrets.failures, ['shop']);

  await prisma.project.update({
    where: { slug: 'shop' },
    data: { envVars: encryptEnvVars({ API_KEY: 'secret-value' }) },
  });
  assert.equal((await reconcileV4({ prisma })).ok, true);
});

test('reconcile: suffixed preview projects do not count as drift', async () => {
  // A preview environment maps its own `<slug>-preview` project (Phase 3);
  // system-level fields belong to the production project only.
  const shop = await prisma.project.findUnique({ where: { slug: 'shop' } });
  const map = await prisma.legacyProjectMap.findUnique({ where: { projectId: shop.id } });
  const previewEnv = await prisma.systemEnvironment.create({
    data: { organisationId: org.id, systemId: map.systemId, name: 'preview' },
  });
  const previewProject = await prisma.project.create({
    data: { name: 'Shop (preview)', slug: 'shop-preview', status: 'building', isPreview: true },
  });
  await prisma.legacyProjectMap.create({
    data: {
      organisationId: org.id, projectId: previewProject.id,
      systemId: map.systemId, environmentId: previewEnv.id,
    },
  });

  const report = await reconcileV4({ prisma });
  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.deepEqual(report.drift, [], 'preview slug/name/status differences are by design');
  assert.deepEqual(report.missingDomains, [], 'preview environments need no default domain');
});

test('reconcile: operator endpoint serves the report to admins only', async () => {
  const anon = await app.inject({ method: 'GET', url: '/api/server/reconcile-v4' });
  assert.equal(anon.statusCode, 401);

  const res = await app.inject({ method: 'GET', url: '/api/server/reconcile-v4', headers: auth() });
  assert.equal(res.statusCode, 200);
  const report = res.json();
  assert.equal(report.ok, true);
  assert.equal(report.projects.mapped, 4, '3 bridged + 1 preview project');
  assert.equal(report.backup.schemaMarker, true);
});
