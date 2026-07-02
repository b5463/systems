'use strict';

// V4 Phase 0 — Tomas's stabilisation surface: schema/features/jobs endpoints,
// the canonical error envelope, and the shared pagination policy.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const { parsePagination, envelope, DEFAULT_LIMIT, MAX_LIMIT } = require('../src/util/pagination');

// ─── Pagination policy (pure) ───────────────────────────────────────────────

test('pagination: defaults apply when query is empty or invalid', () => {
  assert.deepEqual(parsePagination({}), { limit: DEFAULT_LIMIT, offset: 0 });
  assert.deepEqual(parsePagination({ limit: 'abc', offset: -5 }), { limit: DEFAULT_LIMIT, offset: 0 });
  assert.deepEqual(parsePagination({ limit: 0 }), { limit: DEFAULT_LIMIT, offset: 0 });
});

test('pagination: limit is clamped to the maximum', () => {
  assert.equal(parsePagination({ limit: 10_000 }).limit, MAX_LIMIT);
  assert.equal(parsePagination({ limit: 10_000 }, { maxLimit: 500 }).limit, 500);
  assert.deepEqual(parsePagination({ limit: '25', offset: '75' }), { limit: 25, offset: 75 });
});

test('pagination: envelope carries entries, total, limit and offset', () => {
  assert.deepEqual(
    envelope(['a'], 42, { limit: 10, offset: 20 }),
    { entries: ['a'], total: 42, limit: 10, offset: 20 },
  );
});

// ─── Error envelope (inject, no DB needed) ──────────────────────────────────

const { buildApp } = require('../src/app');

let app;
before(async () => {
  app = await buildApp();
  await app.ready();
});
after(async () => { if (app) await app.close(); });

test('errors: unknown routes return the canonical envelope', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
  assert.equal(res.statusCode, 404);
  const body = res.json();
  assert.equal(body.error, 'Not found');
  assert.equal(body.code, 'NOT_FOUND');
  assert.equal(body.statusCode, 404);
  assert.equal(body.requestId, res.headers['x-request-id']);
});

test('errors: framework errors carry code, statusCode and requestId', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ username: 'a', password: 'x'.repeat(600 * 1024) }),
  });
  assert.equal(res.statusCode, 413);
  const body = res.json();
  assert.equal(body.statusCode, 413);
  assert.equal(body.code, 'FST_ERR_CTP_BODY_TOO_LARGE');
  assert.ok(body.error, 'message must be present');
  assert.equal(body.requestId, res.headers['x-request-id']);
});

// ─── Authenticated endpoints (DB-backed) ────────────────────────────────────

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 endpoint db tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
} else {
  let cookie;
  let csrf;

  before(async () => {
    await resetDb();
    await prisma.user.create({
      data: { username: 'root', passwordHash: bcrypt.hashSync('correct-horse-battery', 12) },
    });
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'root', password: 'correct-horse-battery' },
    });
    cookie = res.headers['set-cookie'].split(';')[0];
    csrf = res.json().csrfToken;
  });

  const auth = () => ({ cookie, 'x-csrf-token': csrf });

  test('schema endpoint: reports engine and Prisma migration state', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/api/server/schema' });
    assert.equal(unauth.statusCode, 401);

    const res = await app.inject({ method: 'GET', url: '/api/server/schema', headers: auth() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.database, 'postgres');
    assert.equal(body.ledger, 'ok');
    assert.ok(body.migrations.applied >= 4, 'all repo migrations must be applied');
    assert.equal(body.migrations.pending, 0);
    assert.deepEqual(body.migrations.pendingNames, []);
    assert.match(body.migrations.lastApplied, /^20\d{12}_/, 'timestamped migration name');
    assert.ok(body.migrations.lastAppliedAt);
  });

  test('features endpoint: returns resolved V2/V3/V4 flags', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/server/features', headers: auth() });
    assert.equal(res.statusCode, 200);
    const { features } = res.json();
    assert.equal(typeof features.dockerfileMode, 'boolean');
    assert.equal(features.v4Jobs, false);
    assert.equal(features.v4Commerce, false);
  });

  test('jobs endpoint: reports runner gate and queue counts', async () => {
    const { jobRepo } = require('../src/repo');
    await jobRepo.enqueue({ jobType: 'v4.placeholder' });

    const res = await app.inject({ method: 'GET', url: '/api/server/jobs', headers: auth() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.enabled, false);
    assert.ok(body.counts.pending >= 1);
    assert.equal(typeof body.counts.dead, 'number');
  });

  test('audit list: returns the shared pagination envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audit?limit=5000', headers: auth() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.entries));
    assert.equal(typeof body.total, 'number');
    assert.equal(body.limit, 200, 'limit must clamp to the shared maximum');
    assert.equal(body.offset, 0);
  });
}
