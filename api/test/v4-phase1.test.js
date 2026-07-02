'use strict';

// V4 Phase 1 — PostgreSQL foundation hardening: foundational org-scoped
// tables + repositories, hash-chained v4 audit, per-type job concurrency,
// and session hardening (token entropy + concurrent session cap).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const { typePrefix, concurrencyFor, TYPE_CONCURRENCY } = require('../src/util/jobs');
const { GENESIS, hashEntryV4, verifyChain } = require('../src/util/audit');

// ─── Per-type concurrency policy (pure) ─────────────────────────────────────

test('jobs: type families map to their roadmap concurrency caps', () => {
  assert.equal(concurrencyFor('build.image'), 1);
  assert.equal(concurrencyFor('stripe.reconcile.orders'), 3);
  assert.equal(concurrencyFor('email.fulfilment'), 10);
  assert.equal(concurrencyFor('analytics.aggregate.hourly'), 5);
  assert.equal(concurrencyFor('webhook.retry'), 20);
  assert.equal(concurrencyFor('something.new'), 5, 'unknown families get the default');
  assert.equal(typePrefix('build.image'), 'build');
  assert.deepEqual(Object.keys(TYPE_CONCURRENCY).sort(), ['analytics', 'build', 'email', 'stripe', 'webhook']);
});

// ─── V4 audit chain (pure) ──────────────────────────────────────────────────

test('audit v4: chain verifies and detects content tampering', () => {
  const row1 = {
    id: 1, organisation_id: 'org-a', admin_user_id: 'u-1', action: 'x',
    entity_type: 'system', entity_id: 's-1', detail: 'd', ip: null, created_at: '2026-07-02 12:00:00',
  };
  row1.prev_hash = GENESIS;
  row1.hash = hashEntryV4(GENESIS, row1);
  const row2 = {
    id: 2, organisation_id: 'org-a', admin_user_id: null, action: 'y',
    entity_type: null, entity_id: null, detail: null, ip: null, created_at: '2026-07-02 12:00:01',
  };
  row2.prev_hash = row1.hash;
  row2.hash = hashEntryV4(row1.hash, row2);

  assert.equal(verifyChain([row1, row2], hashEntryV4).ok, true);
  const tampered = [{ ...row1, detail: 'changed' }, row2];
  const result = verifyChain(tampered, hashEntryV4);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAtId, 1);
});

// ─── DB-backed ──────────────────────────────────────────────────────────────

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 phase 1 db tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
} else {
  const {
    orgRepo, adminUserRepo, adminSessionRepo, auditV4Repo, jobRepo, userRepo,
  } = require('../src/repo');
  const jobrunner = require('../src/services/jobrunner');
  const { buildApp } = require('../src/app');

  let app;
  before(async () => {
    await resetDb();
    app = await buildApp();
    await app.ready();
  });
  after(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  test('organisations: ensureDefault is idempotent', async () => {
    const first = await orgRepo.ensureDefault();
    const second = await orgRepo.ensureDefault();
    assert.equal(first.id, second.id);
    assert.equal(first.slug, 'acronym');
    assert.match(first.id, /^[0-9a-f-]{36}$/, 'UUID primary key');
  });

  test('admin users: org-scoped create with unique usernames', async () => {
    const org = await orgRepo.ensureDefault();
    const created = await adminUserRepo.create({
      organisationId: org.id, username: 'alex', passwordHash: 'x'.repeat(60),
    });
    assert.equal(created.role, 'admin');
    assert.equal((await adminUserRepo.findByUsername('alex')).id, created.id);
    await assert.rejects(
      adminUserRepo.create({ organisationId: org.id, username: 'alex', passwordHash: 'y' }),
      /unique/i,
    );
  });

  test('admin sessions: raw token never stored; cap revokes the oldest', async () => {
    const org = await orgRepo.ensureDefault();
    const admin = await adminUserRepo.create({
      organisationId: org.id, username: 'session-admin', passwordHash: 'x'.repeat(60),
    });

    const { session, rawToken } = await adminSessionRepo.create({
      organisationId: org.id, adminUserId: admin.id,
    });
    assert.match(rawToken, /^[0-9a-f]{64}$/, '256-bit hex token');
    assert.notEqual(session.tokenHash, rawToken, 'only the hash is stored');
    assert.equal((await adminSessionRepo.findByToken(rawToken)).id, session.id);

    for (let i = 0; i < 5; i++) {
      await adminSessionRepo.create({ organisationId: org.id, adminUserId: admin.id });
    }
    const count = await prisma.adminSession.count({ where: { adminUserId: admin.id } });
    assert.equal(count, 5, 'cap holds at 5');
    assert.equal(await adminSessionRepo.findByToken(rawToken), null, 'oldest session was revoked');
  });

  test('audit v4: appends chain against the database and detects tampering', async () => {
    const org = await orgRepo.ensureDefault();
    const id1 = await auditV4Repo.append({
      organisation_id: org.id, action: 'v4_test', entity_type: 'system', entity_id: 'sys-1', detail: 'one',
    });
    await auditV4Repo.append({ organisation_id: org.id, action: 'v4_test_2' });

    assert.equal((await auditV4Repo.verify()).ok, true);

    await prisma.auditLogV4.update({ where: { id: id1 }, data: { detail: 'tampered' } });
    const broken = await auditV4Repo.verify();
    assert.equal(broken.ok, false);
    assert.equal(broken.brokenAtId, id1);
  });

  test('jobs: claim skips saturated type families', async () => {
    await prisma.job.deleteMany({});
    await jobRepo.enqueue({ jobType: 'build.image' });
    await jobRepo.enqueue({ jobType: 'email.fulfilment' });

    const claimed = await jobRepo.claimNext('w', ['build']);
    assert.equal(claimed.job_type, 'email.fulfilment', 'build family excluded');
    const next = await jobRepo.claimNext('w', ['build']);
    assert.equal(next, null, 'only the build job remains and it is excluded');
    const build = await jobRepo.claimNext('w', []);
    assert.equal(build.job_type, 'build.image');
    await jobRepo.complete(claimed.id);
    await jobRepo.complete(build.id);
  });

  test('jobs: runner enforces per-type concurrency (build family = 1)', async () => {
    await prisma.job.deleteMany({});
    let current = 0;
    let maxObserved = 0;
    jobrunner.register('build.slow', async () => {
      current += 1;
      maxObserved = Math.max(maxObserved, current);
      await new Promise((r) => setTimeout(r, 25));
      current -= 1;
    });
    for (let i = 0; i < 3; i++) await jobRepo.enqueue({ jobType: 'build.slow' });

    const { processed } = await jobrunner.tick();
    assert.equal(processed, 3, 'all build jobs run');
    assert.equal(maxObserved, 1, 'never more than one concurrent build');
    assert.equal((await jobRepo.counts()).completed, 3);
  });

  test('sessions: login mints 256-bit ids and caps concurrent sessions at 5', async () => {
    await prisma.user.deleteMany({ where: { username: 'cap-user' } });
    const user = await prisma.user.create({
      data: { username: 'cap-user', passwordHash: bcrypt.hashSync('correct-horse-battery', 12) },
    });

    let lastCookie;
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { username: 'cap-user', password: 'correct-horse-battery' },
      });
      assert.equal(res.statusCode, 200);
      lastCookie = res.headers['set-cookie'];
    }

    const jwt = lastCookie.split(';')[0].split('=')[1];
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    assert.match(payload.jti, /^[0-9a-f]{64}$/, 'session id from crypto.randomBytes(32)');

    const sessions = await userRepo.listUserSessions(user.id);
    assert.equal(sessions.length, 5, '6th login revokes the oldest session');
  });
}
