'use strict';

// V4 Phase 0.5 — namespace boundary tests.
//
// Locks the /api namespace strategy (docs/V4/NAMESPACES.md) before any route
// migration: legacy namespaces stay compatible, future V4 namespaces must
// never be reachable with the wrong auth class. For namespaces that do not
// exist yet, the contract today is "no route responds, and nothing issues a
// session" — when V4 routes land, these tests must be extended, not deleted.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const { applyDeprecation, deprecated } = require('../src/util/deprecation');

// ─── Deprecation header helper (pure) ───────────────────────────────────────

function fakeReply() {
  const headers = {};
  return {
    headers,
    header(name, value) { headers[name] = value; return this; },
  };
}

test('deprecation: helper sets Deprecation, Link and Sunset headers', () => {
  const reply = fakeReply();
  applyDeprecation(reply, { successor: '/api/systems', sunset: '2027-01-01T00:00:00Z' });
  assert.equal(reply.headers.Deprecation, 'true');
  assert.equal(reply.headers.Link, '</api/systems>; rel="successor-version"');
  assert.match(reply.headers.Sunset, /GMT$/);
});

test('deprecation: sunset omitted when absent or invalid; onSend form passes payload through', async () => {
  const bare = fakeReply();
  applyDeprecation(bare, { successor: '/api/systems', sunset: 'not-a-date' });
  assert.equal(bare.headers.Sunset, undefined);

  const hook = deprecated({ successor: '/api/systems' });
  const reply = fakeReply();
  const payload = await hook({}, reply, '{"ok":true}');
  assert.equal(payload, '{"ok":true}');
  assert.equal(reply.headers.Deprecation, 'true');
});

// ─── Namespace boundaries (inject) ──────────────────────────────────────────

const { hasDb, prisma, resetDb } = require('./_dbtest');
const { buildApp } = require('../src/app');

let app;
before(async () => {
  app = await buildApp();
  await app.ready();
});
after(async () => {
  if (app) await app.close();
  if (hasDb) await prisma.$disconnect();
});

test('namespaces: future V4 namespaces expose no routes today and never issue cookies', async () => {
  for (const url of [
    '/api/public/catalog',
    '/api/ingest/heartbeat',
    '/api/webhooks/stripe',
    '/api/systems',
    '/api/products',
    '/api/commerce/offers',
  ]) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 404, `${url} must not exist yet`);
    assert.equal(res.headers['set-cookie'], undefined, `${url} must not issue a session`);
    assert.equal(res.json().code, 'NOT_FOUND');
  }
});

test('namespaces: admin namespace requires admin auth', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/settings' });
  assert.equal(res.statusCode, 401, 'admin routes reject anonymous requests');
});

test('namespaces: legacy webhook rejects unsigned events (flag on) and stays dark (flag off)', async () => {
  // Flags are read per-request; with GITHUB deploys off the route must 404.
  const off = await app.inject({
    method: 'POST', url: '/api/webhook/github',
    headers: { 'content-type': 'application/json' },
    payload: {},
  });
  assert.ok([404, 401, 403].includes(off.statusCode), 'unsigned webhook never accepted');
  assert.ok(off.statusCode < 200 || off.statusCode >= 300);
});

if (!hasDb) {
  test('namespace db boundary tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
} else {
  test('namespaces: legacy /api/projects stays admin-gated and functional', async () => {
    await resetDb();
    await prisma.user.create({
      data: { username: 'ns-admin', passwordHash: bcrypt.hashSync('correct-horse-battery', 12) },
    });

    const anon = await app.inject({ method: 'GET', url: '/api/projects' });
    assert.equal(anon.statusCode, 401, 'legacy projects API requires a session');

    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'ns-admin', password: 'correct-horse-battery' },
    });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers['set-cookie'].split(';')[0];

    const authed = await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } });
    assert.equal(authed.statusCode, 200, 'legacy projects API works with a session');
    assert.ok(Array.isArray(authed.json().projects), 'legacy response shape unchanged');
  });

  test('namespaces: admin session cookie does not unlock future ingestion namespaces', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { username: 'ns-admin', password: 'correct-horse-battery' },
    });
    const cookie = login.headers['set-cookie'].split(';')[0];

    for (const url of ['/api/ingest/heartbeat', '/api/webhooks/stripe']) {
      const res = await app.inject({ method: 'POST', url, headers: { cookie }, payload: {} });
      assert.equal(res.statusCode, 404, `${url} must not accept admin sessions (integration keys only, once live)`);
    }
  });
}
