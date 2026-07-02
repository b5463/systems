'use strict';

// V4 Phase 0 — stabilisation tests (see docs/V4/V4_DEVELOPER_ALLOCATION.md).
// Covers: V4 feature-flag gates, CORS PATCH, global request IDs (header +
// AsyncLocalStorage + audit stamping), stricter JSON body limit, no-store
// cache headers, and the jobs table / repo / in-process runner skeleton.

const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { features } = require('../src/util/flags');
const { BACKOFF_MS, backoffMs, afterFailure } = require('../src/util/jobs');
const { requestIdFrom, runWithRequestId, currentRequestId } = require('../src/util/requestcontext');

// ─── Feature flags ──────────────────────────────────────────────────────────

test('v4 flags: every V4 gate defaults OFF', () => {
  const f = features({});
  for (const key of ['v4Platform', 'v4Products', 'v4Systems', 'v4Portfolio', 'v4Commerce',
    'v4Licensing', 'v4Analytics', 'v4ExternalIntegrations', 'v4Jobs']) {
    assert.equal(f[key], false, `${key} must default to false`);
  }
});

test('v4 flags: gates enable via ENABLE_V4_* env', () => {
  const f = features({ ENABLE_V4_SYSTEMS: 'true', ENABLE_V4_JOBS: '1', ENABLE_V4_COMMERCE: 'no' });
  assert.equal(f.v4Systems, true);
  assert.equal(f.v4Jobs, true);
  assert.equal(f.v4Commerce, false);
});

// ─── Request context ────────────────────────────────────────────────────────

test('request id: honours safe inbound X-Request-Id values', () => {
  assert.equal(requestIdFrom('abc-123.DEF_456'), 'abc-123.DEF_456');
});

test('request id: replaces unsafe or oversized inbound values with a UUID', () => {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(requestIdFrom('evil\nheader"injection'), uuidRe);
  assert.match(requestIdFrom('x'.repeat(65)), uuidRe);
  assert.match(requestIdFrom(undefined), uuidRe);
});

test('request id: AsyncLocalStorage context survives async boundaries', async () => {
  assert.equal(currentRequestId(), null);
  await runWithRequestId('req-1', async () => {
    await new Promise((r) => setImmediate(r));
    assert.equal(currentRequestId(), 'req-1');
  });
  assert.equal(currentRequestId(), null);
});

// ─── Job queue policy (pure) ────────────────────────────────────────────────

test('jobs: backoff schedule is 30s, 5m, 30m (capped)', () => {
  assert.deepEqual(BACKOFF_MS, [30_000, 300_000, 1_800_000]);
  assert.equal(backoffMs(1), 30_000);
  assert.equal(backoffMs(2), 300_000);
  assert.equal(backoffMs(3), 1_800_000);
  assert.equal(backoffMs(9), 1_800_000);
});

test('jobs: afterFailure retries with backoff until max, then dead-letters', () => {
  assert.deepEqual(afterFailure({ attempts: 1, max_attempts: 3 }), { status: 'pending', retryInMs: 30_000 });
  assert.deepEqual(afterFailure({ attempts: 2, max_attempts: 3 }), { status: 'pending', retryInMs: 300_000 });
  assert.deepEqual(afterFailure({ attempts: 3, max_attempts: 3 }), { status: 'dead' });
  assert.deepEqual(afterFailure({ attempts: 5, max_attempts: 3 }), { status: 'dead' });
});

test('jobs: runner start() is a no-op unless ENABLE_V4_JOBS is set', () => {
  const jobrunner = require('../src/services/jobrunner');
  delete process.env.ENABLE_V4_JOBS;
  assert.equal(jobrunner.start(), false);
  jobrunner.stop();
});

// ─── App-level behaviour (inject) ───────────────────────────────────────────

const { buildApp } = require('../src/app');

let app;
before(async () => {
  app = await buildApp();
  await app.ready();
});
after(async () => { if (app) await app.close(); });

test('cors: preflight allows PATCH', async () => {
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/api/projects',
    headers: {
      origin: 'https://systems.acronym.sk',
      'access-control-request-method': 'PATCH',
    },
  });
  assert.equal(res.statusCode, 204);
  assert.match(res.headers['access-control-allow-methods'], /PATCH/);
});

test('request id: response carries X-Request-Id (echoed when safe, generated otherwise)', async () => {
  const echoed = await app.inject({
    method: 'GET', url: '/api/projects', headers: { 'x-request-id': 'proxy-abc-1' },
  });
  assert.equal(echoed.headers['x-request-id'], 'proxy-abc-1');

  const generated = await app.inject({ method: 'GET', url: '/api/projects' });
  assert.match(generated.headers['x-request-id'], /^[0-9a-f-]{36}$/);

  const sanitized = await app.inject({
    method: 'GET', url: '/api/projects', headers: { 'x-request-id': 'bad id with spaces!' },
  });
  assert.match(sanitized.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('headers: API responses are never cacheable', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('body limit: oversized JSON payloads are rejected with 413', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ username: 'a', password: 'x'.repeat(600 * 1024) }),
  });
  assert.equal(res.statusCode, 413);
});

// ─── DB-backed: jobs lifecycle + audit request stamping ─────────────────────

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 phase 0 db tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
} else {
  const { jobRepo, auditRepo } = require('../src/repo');
  const jobrunner = require('../src/services/jobrunner');

  test('jobs: enqueue → claim → complete lifecycle', async () => {
    await resetDb();
    const created = await jobRepo.enqueue({ jobType: 'v4.test', payload: { n: 1 } });
    assert.equal(created.status, 'pending');

    const claimed = await jobRepo.claimNext('worker-a');
    assert.ok(claimed, 'a due pending job must be claimable');
    assert.equal(claimed.id, created.id);
    assert.equal(claimed.status, 'running');
    assert.equal(claimed.attempts, 1);

    // While locked/running it must not be claimable again.
    assert.equal(await jobRepo.claimNext('worker-b'), null);

    await jobRepo.complete(claimed.id);
    const done = await jobRepo.findById(claimed.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.lockedBy, null);
  });

  test('jobs: failure backs off, then dead-letters at max attempts', async () => {
    await resetDb();
    const job = await jobRepo.enqueue({ jobType: 'v4.flaky', maxAttempts: 2 });

    let claimed = await jobRepo.claimNext('worker-a');
    await jobRepo.fail(claimed.id, 'boom 1');
    let row = await jobRepo.findById(job.id);
    assert.equal(row.status, 'pending');
    assert.ok(row.nextRunAt.getTime() > Date.now() + 20_000, 'retry must be delayed by backoff');
    assert.equal(row.lastError, 'boom 1');

    // Not due yet → not claimable.
    assert.equal(await jobRepo.claimNext('worker-a'), null);

    // Force it due, fail again → attempts reach max → dead.
    await prisma.job.update({ where: { id: job.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    claimed = await jobRepo.claimNext('worker-a');
    assert.equal(claimed.attempts, 2);
    await jobRepo.fail(claimed.id, 'boom 2');
    row = await jobRepo.findById(job.id);
    assert.equal(row.status, 'dead');
  });

  test('jobs: stale running locks are released back to pending', async () => {
    await resetDb();
    const job = await jobRepo.enqueue({ jobType: 'v4.stale' });
    await jobRepo.claimNext('worker-crashed');
    await prisma.job.update({
      where: { id: job.id },
      data: { lockedAt: new Date(Date.now() - 10 * 60_000) },
    });
    const released = await jobRepo.releaseStale(5 * 60_000);
    assert.equal(released, 1);
    const row = await jobRepo.findById(job.id);
    assert.equal(row.status, 'pending');
    assert.equal(row.lockedBy, null);
  });

  test('jobs: runner executes registered handlers and fails unknown types', async () => {
    await resetDb();
    const seen = [];
    jobrunner.register('v4.handled', async (payload) => { seen.push(payload); });

    await jobRepo.enqueue({ jobType: 'v4.handled', payload: { hello: 'world' } });
    await jobRepo.enqueue({ jobType: 'v4.unknown' });

    const { processed } = await jobrunner.tick();
    assert.equal(processed, 2);
    assert.deepEqual(seen, [{ hello: 'world' }]);

    const counts = await jobRepo.counts();
    assert.equal(counts.completed, 1);
    assert.equal(counts.pending, 1); // unknown type is retrying (backoff), will dead-letter at max
  });

  test('audit: entries are stamped with the current request id; chain stays valid', async () => {
    await resetDb();
    const id = await runWithRequestId('req-audit-42', () =>
      auditRepo.appendAudit({ action: 'v4_phase0_test', target: 'test' }));
    const row = await prisma.auditLog.findUnique({ where: { id } });
    assert.equal(row.requestId, 'req-audit-42');

    await auditRepo.appendAudit({ action: 'v4_phase0_no_ctx' });
    const chain = await auditRepo.verifyAuditChain();
    assert.equal(chain.ok, true);
  });
}
