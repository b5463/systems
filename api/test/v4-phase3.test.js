'use strict';

// V4 Phase 3 — deploy engine on Systems/Environments. Orchestration is tested
// with injected fakes (no Docker needed): mapping-layer delegation into the
// legacy pipeline, Docker label generation, release sync from the pipeline,
// preview/production isolation, and the promotion health gate (including the
// first-ever promotion where retain-previous must be a no-op).

const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 phase 3 tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
  return;
}

const { orgRepo, systemRepo } = require('../src/repo');
const deployservice = require('../src/services/deployservice');
const v4sync = require('../src/services/v4sync');
const { migrateProjects } = require('../scripts/migrate-projects-to-v4');
const { buildApp } = require('../src/app');

let app;
let cookie;
let csrf;
let org;

const auth = () => ({ cookie, 'x-csrf-token': csrf });
const flagOn = () => { process.env.ENABLE_V4_SYSTEMS = 'true'; };
const flagOff = () => { delete process.env.ENABLE_V4_SYSTEMS; };

before(async () => {
  flagOff();
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
});

after(async () => {
  flagOff();
  deployservice.setDeps(null);
  if (app) await app.close();
  await prisma.$disconnect();
});

afterEach(() => deployservice.setDeps(null));

async function createSystemWithPreview(slug) {
  const system = await systemRepo.create(org.id, { name: slug, slug });
  const preview = await prisma.systemEnvironment.create({
    data: { organisationId: org.id, systemId: system.id, name: 'preview' },
  });
  return { system, production: system.environments[0], preview };
}

test('resolve: unknown system and unknown environment are 404s; native systems have no project', async () => {
  const { system } = await createSystemWithPreview('resolver');
  assert.equal((await deployservice.resolveTarget(org.id, '00000000-0000-0000-0000-000000000000', 'production')).error.code, 404);
  assert.equal((await deployservice.resolveTarget(org.id, system.id, 'staging')).error.code, 404);
  const target = await deployservice.resolveTarget(org.id, system.id, 'production');
  assert.equal(target.project, null, 'V4-native system has no legacy project yet');
});

test('deploy: V4-native system creates + maps a legacy project through the pipeline', async () => {
  const { system, production } = await createSystemWithPreview('native-app');

  const calls = [];
  deployservice.setDeps({
    beginDeploy: async (args) => {
      calls.push(['deploy', args.slug, args.visibility]);
      const project = await prisma.project.create({ data: { name: args.name, slug: args.slug, status: 'building' } });
      return { ok: true, project: { id: project.id, slug: args.slug } };
    },
    beginRedeploy: async () => { throw new Error('must not redeploy an unmapped system'); },
  });

  const result = await deployservice.deployToEnvironment({
    organisationId: org.id, systemId: system.id, envName: 'production',
    zipPath: '/tmp/fake.zip', userId: 1, ip: '127.0.0.1',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['deploy', 'native-app', 'public']]);

  const map = await prisma.legacyProjectMap.findFirst({ where: { systemId: system.id } });
  assert.ok(map, 'system is mapped after its first deploy');
  assert.equal(map.environmentId, production.id);

  const domain = await prisma.domain.findFirst({ where: { systemId: system.id } });
  assert.equal(domain.hostname, 'native-app.acronym.sk', 'first production deploy records the default domain');

  const audit = await prisma.auditLogV4.findFirst({ where: { entityId: production.id } });
  assert.equal(audit.action, 'environment_deploy');
});

test('deploy: preview environment of a deployed system gets its own suffixed project', async () => {
  const system = await systemRepo.findBySlug(org.id, 'native-app');
  const preview = system.environments.find((e) => e.name === 'preview');

  const calls = [];
  deployservice.setDeps({
    beginDeploy: async (args) => {
      calls.push([args.slug, args.name]);
      const project = await prisma.project.create({
        data: { name: args.name, slug: args.slug, status: 'building', isPreview: true },
      });
      return { ok: true, project: { id: project.id, slug: args.slug } };
    },
    beginRedeploy: async () => { throw new Error('preview env is unmapped — must not redeploy'); },
  });

  const result = await deployservice.deployToEnvironment({
    organisationId: org.id, systemId: system.id, envName: 'preview',
    zipPath: '/tmp/fake.zip', userId: 1, ip: '127.0.0.1',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['native-app-preview', 'native-app (preview)']],
    'preview project slug is suffixed so it cannot collide with production');
  const map = await prisma.legacyProjectMap.findFirst({ where: { environmentId: preview.id } });
  assert.ok(map, 'preview environment mapped to its own project');
});

test('deploy: mapped system redeploys its legacy project', async () => {
  await prisma.project.create({ data: { name: 'Mapped', slug: 'mapped-app', status: 'running' } });
  await migrateProjects({ prisma, organisationId: org.id });
  const system = await systemRepo.findBySlug(org.id, 'mapped-app');

  const calls = [];
  deployservice.setDeps({
    beginRedeploy: async (args) => { calls.push(args.slug); return { ok: true, slug: args.slug }; },
    beginDeploy: async () => { throw new Error('must not create a second project'); },
  });

  const result = await deployservice.deployToEnvironment({
    organisationId: org.id, systemId: system.id, envName: 'production',
    zipPath: '/tmp/fake.zip', userId: 1, ip: '127.0.0.1',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['mapped-app']);
});

test('rollback: delegates through the mapping layer; unmapped environments are 409', async () => {
  const system = await systemRepo.findBySlug(org.id, 'mapped-app');
  const calls = [];
  deployservice.setDeps({
    rollbackProject: async ({ slug }) => { calls.push(slug); return { ok: true, project: { slug } }; },
  });

  const ok = await deployservice.rollbackEnvironment({
    organisationId: org.id, systemId: system.id, envName: 'production', userId: 1, ip: '127.0.0.1',
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(calls, ['mapped-app']);

  const native = await systemRepo.findBySlug(org.id, 'resolver');
  const none = await deployservice.rollbackEnvironment({
    organisationId: org.id, systemId: native.id, envName: 'production', userId: 1, ip: '127.0.0.1',
  });
  assert.equal(none.code, 409);
});

test('promote: requires a preview release; health gate blocks unhealthy promotions', async () => {
  const { system, preview } = await createSystemWithPreview('promote-app');

  const empty = await deployservice.promote({ organisationId: org.id, systemId: system.id, userId: 1, ip: '::1' });
  assert.equal(empty.code, 400, 'no preview release yet');

  const previewRelease = await prisma.release.create({
    data: {
      organisationId: org.id, systemId: system.id, environmentId: preview.id,
      containerId: 'c-preview', imageId: 'img-preview', port: 35001, status: 'active',
    },
  });
  await prisma.systemEnvironment.update({ where: { id: preview.id }, data: { currentReleaseId: previewRelease.id } });

  deployservice.setDeps({
    health: {
      targetForPort: (p) => ({ port: p }),
      waitForHealthy: async () => { throw new Error('connect ECONNREFUSED'); },
    },
  });
  const blocked = await deployservice.promote({ organisationId: org.id, systemId: system.id, userId: 1, ip: '::1' });
  assert.equal(blocked.code, 502);

  const production = (await systemRepo.findBySlug(org.id, 'promote-app')).environments.find((e) => e.name === 'production');
  assert.equal(production.currentReleaseId, null, 'failed promotion recorded nothing');
});

test('promote: first promotion succeeds with no previous release; repeat supersedes', async () => {
  const system = await systemRepo.findBySlug(org.id, 'promote-app');
  const routes = [];
  deployservice.setDeps({
    health: { targetForPort: (p) => ({ port: p }), waitForHealthy: async () => {} },
    proxy: { publishRoute: async (o) => { routes.push(o.slug); return { published: true }; } },
  });

  const first = await deployservice.promote({ organisationId: org.id, systemId: system.id, userId: 1, ip: '::1' });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.release.imageId, 'img-preview');
  assert.equal(first.release.metadata.includes('promote'), true);

  const supersededCount = await prisma.release.count({
    where: { systemId: system.id, status: 'superseded' },
  });
  assert.equal(supersededCount, 0, 'first-ever promotion has nothing to retain (no-op, not a failure)');

  // Second promotion supersedes the first production release.
  const preview = (await systemRepo.findBySlug(org.id, 'promote-app')).environments.find((e) => e.name === 'preview');
  const nextPreview = await prisma.release.create({
    data: {
      organisationId: org.id, systemId: system.id, environmentId: preview.id,
      containerId: 'c-preview-2', imageId: 'img-preview-2', port: 35002, status: 'active',
    },
  });
  await prisma.systemEnvironment.update({ where: { id: preview.id }, data: { currentReleaseId: nextPreview.id } });

  const second = await deployservice.promote({ organisationId: org.id, systemId: system.id, userId: 1, ip: '::1' });
  assert.equal(second.ok, true);
  assert.equal(second.release.imageId, 'img-preview-2');
  assert.equal(await prisma.release.count({
    where: { environmentId: (await systemRepo.findBySlug(org.id, 'promote-app')).environments.find((e) => e.name === 'production').id, status: 'superseded' },
  }), 1, 'previous production release retained as superseded');
});

test('v4sync: labels for mapped systems; release sync supersedes and is idempotent', async () => {
  assert.deepEqual(await v4sync.labelsForSlug('does-not-exist'), {});

  const labels = await v4sync.labelsForSlug('mapped-app');
  const map = await prisma.legacyProjectMap.findFirst({
    where: { systemId: (await systemRepo.findBySlug(org.id, 'mapped-app')).id },
  });
  assert.equal(labels['systems.system_id'], map.systemId);
  assert.equal(labels['systems.environment'], 'production');
  assert.equal(labels['systems.slug'], 'mapped-app');

  // Simulate a deploy result on the legacy row, then sync.
  await prisma.project.update({
    where: { slug: 'mapped-app' },
    data: { containerId: 'c-new', imageId: 'img-new', port: 36001, status: 'running' },
  });
  const release = await v4sync.syncReleaseForProject('mapped-app');
  assert.equal(release.imageId, 'img-new');
  const again = await v4sync.syncReleaseForProject('mapped-app');
  assert.equal(again.id, release.id, 'unchanged project row creates no duplicate release');

  const system = await systemRepo.findBySlug(org.id, 'mapped-app');
  assert.equal(system.currentStatus, 'running');
  assert.equal(system.environments[0].currentRelease.imageId, 'img-new');
});

test('routes: deploy namespace is dark with the flag off, live contracts with it on', async () => {
  const system = await systemRepo.findBySlug(org.id, 'promote-app');

  const dark = await app.inject({
    method: 'POST', url: `/api/systems/${system.id}/environments/production/rollback`, headers: auth(),
  });
  assert.equal(dark.statusCode, 404);

  flagOn();
  try {
    const badEnv = await app.inject({
      method: 'POST', url: `/api/systems/${system.id}/environments/staging/rollback`, headers: auth(),
    });
    assert.equal(badEnv.statusCode, 400);

    const logs = await app.inject({
      method: 'GET', url: `/api/systems/${system.id}/environments/preview/logs`, headers: auth(),
    });
    // preview has a recorded release but no reachable Docker here: 409 (no
    // container recorded) or 503 (docker unavailable) — never a 500.
    assert.ok([409, 503].includes(logs.statusCode), `got ${logs.statusCode}`);

    const promoteAnon = await app.inject({ method: 'POST', url: `/api/systems/${system.id}/promote` });
    assert.equal(promoteAnon.statusCode, 401, 'promote requires admin auth');
  } finally {
    flagOff();
  }
});
