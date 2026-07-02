'use strict';

// V4 Phase 2 — Products/Systems data model: migration bridge integrity,
// legacy API compatibility (flag-gated V4 reads with an unchanged contract),
// read/write APIs, and org-scoping acceptance (org A cannot reach org B).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 phase 2 tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
  return;
}

const { migrateProjects } = require('../scripts/migrate-projects-to-v4');
const { orgRepo, systemRepo, productRepo } = require('../src/repo');
const { buildApp } = require('../src/app');

let app;
let cookie;
let csrf;
let org;

const auth = () => ({ cookie, 'x-csrf-token': csrf });

function flagOn() {
  process.env.ENABLE_V4_SYSTEMS = 'true';
  process.env.ENABLE_V4_PRODUCTS = 'true';
}
function flagOff() {
  delete process.env.ENABLE_V4_SYSTEMS;
  delete process.env.ENABLE_V4_PRODUCTS;
}

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

  // Two legacy projects: a full production app (with rollback history, basic
  // auth, custom health path) and a bare one (no container yet).
  await prisma.project.create({
    data: {
      name: 'Shop', slug: 'shop', status: 'running', deployType: 'node',
      containerId: 'c-current', imageId: 'img-current', port: 34001,
      previousContainerId: 'c-prev', previousImageId: 'img-prev',
      visibility: 'password', basicUser: 'preview', basicHash: 'hashed',
      healthPath: '/healthz', routePublished: true,
      repo: 'acronym/shop', deployBranch: 'main', isPrimary: true,
    },
  });
  await prisma.project.create({
    data: { name: 'Blog', slug: 'blog', status: 'stopped', deployType: 'static' },
  });
});

after(async () => {
  flagOff();
  if (app) await app.close();
  await prisma.$disconnect();
});

test('bridge: projects map to systems/environments/releases/domains with correct fields', async () => {
  const result = await migrateProjects({ prisma, organisationId: org.id });
  assert.equal(result.migrated, 2);
  assert.equal(result.skipped, 0);

  const shop = await systemRepo.findBySlug(org.id, 'shop');
  assert.equal(shop.name, 'Shop');
  assert.equal(shop.systemType, 'node');
  assert.equal(shop.currentStatus, 'running');
  assert.equal(shop.repo, 'acronym/shop');
  assert.equal(shop.isPrimaryRoot, true);

  assert.equal(shop.environments.length, 1);
  const env = shop.environments[0];
  assert.equal(env.name, 'production');
  assert.equal(env.accessPolicy, 'password');
  assert.equal(env.healthPath, '/healthz');
  assert.equal(env.routePublished, true);
  assert.equal(env.basicUser, 'preview');

  assert.equal(env.currentRelease.containerId, 'c-current');
  assert.equal(env.currentRelease.port, 34001);
  assert.equal(env.currentRelease.status, 'active');

  const releases = await systemRepo.listReleases(org.id, shop.id);
  assert.equal(releases.length, 2, 'previous release preserved for rollback history');
  const superseded = releases.find((r) => r.status === 'superseded');
  assert.equal(superseded.imageId, 'img-prev');
  assert.equal(superseded.containerId, 'c-prev');

  const domain = await prisma.domain.findFirst({ where: { systemId: shop.id } });
  assert.equal(domain.hostname, 'shop.acronym.sk');
  assert.equal(domain.isCustom, false);

  const map = await prisma.legacyProjectMap.findMany({ where: { organisationId: org.id } });
  assert.equal(map.length, 2, 'every project has a map row');

  const blog = await systemRepo.findBySlug(org.id, 'blog');
  assert.equal(blog.environments[0].currentRelease, null, 'no release when project never deployed');
});

test('bridge: re-running is a no-op (idempotent, non-destructive)', async () => {
  const again = await migrateProjects({ prisma, organisationId: org.id });
  assert.equal(again.migrated, 0);
  assert.equal(again.skipped, 2);
  assert.equal(await prisma.system.count(), 2, 'no duplicate systems');
  assert.equal(await prisma.release.count(), 2, 'no duplicate releases');
});

test('compat: legacy projects API is byte-identical with V4 reads enabled', async () => {
  const legacyList = await app.inject({ method: 'GET', url: '/api/projects', headers: auth() });
  const legacyOne = await app.inject({ method: 'GET', url: '/api/projects/shop', headers: auth() });

  flagOn();
  try {
    const v4List = await app.inject({ method: 'GET', url: '/api/projects', headers: auth() });
    const v4One = await app.inject({ method: 'GET', url: '/api/projects/shop', headers: auth() });
    assert.deepEqual(v4List.json(), legacyList.json(), 'list contract unchanged');
    assert.deepEqual(v4One.json(), legacyOne.json(), 'detail contract unchanged');
  } finally {
    flagOff();
  }
});

test('systems api: dark when flag off; serves migrated systems when on', async () => {
  const dark = await app.inject({ method: 'GET', url: '/api/systems', headers: auth() });
  assert.equal(dark.statusCode, 404);

  flagOn();
  try {
    const res = await app.inject({ method: 'GET', url: '/api/systems', headers: auth() });
    assert.equal(res.statusCode, 200);
    const { systems } = res.json();
    assert.equal(systems.length, 2);
    const shop = systems.find((s) => s.slug === 'shop');
    assert.equal(shop.environments[0].currentRelease.imageId, 'img-current');

    const one = await app.inject({ method: 'GET', url: `/api/systems/${shop.id}`, headers: auth() });
    assert.equal(one.statusCode, 200);
    const envs = await app.inject({ method: 'GET', url: `/api/systems/${shop.id}/environments`, headers: auth() });
    assert.equal(envs.json().environments.length, 1);
    const rels = await app.inject({ method: 'GET', url: `/api/systems/${shop.id}/releases`, headers: auth() });
    assert.equal(rels.json().releases.length, 2);
  } finally {
    flagOff();
  }
});

test('systems api: create validates, writes audit, rejects duplicate slugs', async () => {
  flagOn();
  try {
    const bad = await app.inject({
      method: 'POST', url: '/api/systems', headers: auth(),
      payload: { name: 'X', slug: 'Bad Slug!' },
    });
    assert.equal(bad.statusCode, 400);

    const created = await app.inject({
      method: 'POST', url: '/api/systems', headers: auth(),
      payload: { name: 'API Service', slug: 'api-service', systemType: 'node' },
    });
    assert.equal(created.statusCode, 201);
    const { system } = created.json();
    assert.equal(system.environments[0].name, 'production', 'production env created with the system');

    const dup = await app.inject({
      method: 'POST', url: '/api/systems', headers: auth(),
      payload: { name: 'API Service 2', slug: 'api-service' },
    });
    assert.equal(dup.statusCode, 409);

    const patched = await app.inject({
      method: 'PATCH', url: `/api/systems/${system.id}`, headers: auth(),
      payload: { currentStatus: 'running' },
    });
    assert.equal(patched.json().system.currentStatus, 'running');

    const audits = await prisma.auditLogV4.findMany({ where: { entityId: system.id } });
    assert.deepEqual(audits.map((a) => a.action).sort(), ['system_created', 'system_updated']);
  } finally {
    flagOff();
  }
});

test('products api: hidden CRUD works behind its own flag', async () => {
  flagOn();
  try {
    const created = await app.inject({
      method: 'POST', url: '/api/products', headers: auth(),
      payload: { name: 'Shop Pro', slug: 'shop-pro', description: 'Test product' },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().product.status, 'draft');

    const list = await app.inject({ method: 'GET', url: '/api/products', headers: auth() });
    assert.equal(list.json().products.length, 1);
  } finally {
    flagOff();
  }
});

test('org scoping: org A cannot read org B systems by ID (repo and API)', async () => {
  const orgB = await orgRepo.create({ name: 'Other Co', slug: 'other-co' });
  const foreign = await systemRepo.create(orgB.id, { name: 'Foreign', slug: 'foreign' });

  // Repo layer: default org cannot see org B's system by id or slug.
  assert.equal(await systemRepo.findById(org.id, foreign.id), null);
  assert.equal(await systemRepo.findBySlug(org.id, 'foreign'), null);
  assert.equal((await systemRepo.list(org.id)).some((s) => s.id === foreign.id), false);
  assert.equal(await systemRepo.update(org.id, foreign.id, { name: 'Hacked' }), null);
  assert.equal((await systemRepo.findById(orgB.id, foreign.id)).name, 'Foreign', 'org B still sees its own system');

  // API layer: the admin session (default org) gets a 404 on direct ID manipulation.
  flagOn();
  try {
    const res = await app.inject({ method: 'GET', url: `/api/systems/${foreign.id}`, headers: auth() });
    assert.equal(res.statusCode, 404);
    const patch = await app.inject({
      method: 'PATCH', url: `/api/systems/${foreign.id}`, headers: auth(),
      payload: { name: 'Hacked' },
    });
    assert.equal(patch.statusCode, 404);
  } finally {
    flagOff();
  }

  const untouched = await systemRepo.findById(orgB.id, foreign.id);
  assert.equal(untouched.name, 'Foreign', 'cross-org write attempts changed nothing');
});

test('org scoping: products are isolated the same way', async () => {
  const orgB = await orgRepo.findBySlug('other-co');
  const foreign = await productRepo.create(orgB.id, { name: 'Foreign P', slug: 'foreign-p' });
  assert.equal(await productRepo.findById(org.id, foreign.id), null);
  assert.equal(await productRepo.update(org.id, foreign.id, { name: 'X' }), null);
});
