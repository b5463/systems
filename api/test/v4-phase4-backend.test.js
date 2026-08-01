'use strict';

// V4 Phase 4 (Alex) — domains verification, routing state machine, route
// publication transaction, canonical redirect, maintenance windows.
//   - pure logic runs without a DB (state machine, verification, rendering)
//   - DB-backed flow runs when DATABASE_URL is set

const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'systems-p4-'));
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '10000';

const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const domainrouting = require('../src/services/domainrouting');
const caddy = require('../src/services/caddy');
const routepublish = require('../src/services/routepublish');

// ── Pure logic (always runs, no DB) ─────────────────────────────────────────

test('route state machine: legal transitions only; active needs a probe (pending->active)', () => {
  assert.equal(domainrouting.canTransitionRoute(null, 'pending'), true);
  assert.equal(domainrouting.canTransitionRoute('pending', 'active'), true);
  assert.equal(domainrouting.canTransitionRoute('pending', 'failed'), true);
  assert.equal(domainrouting.canTransitionRoute('inactive', 'active'), false, 'cannot jump straight to active');
  assert.equal(domainrouting.canTransitionRoute('active', 'superseded'), true);
  assert.equal(domainrouting.canTransitionRoute('failed', 'pending'), true);
  assert.equal(domainrouting.canTransitionRoute('active', 'bogus'), false);
});

test('verification: token is 256-bit, record is the expected TXT, expiry is 48h', () => {
  const v = domainrouting.generateVerification('app.example.com', 1_000_000);
  assert.equal(v.token.length, 64, '32 bytes hex = 256 bits');
  assert.equal(v.method, 'dns-txt');
  assert.deepEqual(v.record, {
    type: 'TXT',
    name: '_systems-verify.app.example.com',
    value: `systems-verify=${v.token}`,
  });
  assert.equal(v.expiresAt.getTime(), 1_000_000 + domainrouting.VERIFY_TTL_MS);
});

test('verification: expiry check', () => {
  assert.equal(domainrouting.isVerificationExpired(new Date(2000), 1000), false);
  assert.equal(domainrouting.isVerificationExpired(new Date(500), 1000), true);
  assert.equal(domainrouting.isVerificationExpired(null, 1000), true);
});

test('DNS verification: matches the TXT record, rejects mismatch/expiry/missing', async () => {
  const token = 'a'.repeat(64);
  const good = async () => [[`systems-verify=${token}`]];
  const wrong = async () => [['systems-verify=nope']];
  const missing = async () => { const e = new Error('ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; };
  const future = new Date(Date.now() + 60_000);

  assert.equal((await domainrouting.checkDnsVerification({ hostname: 'h', token, expiresAt: future, resolveTxt: good })).verified, true);
  assert.equal((await domainrouting.checkDnsVerification({ hostname: 'h', token, expiresAt: future, resolveTxt: wrong })).reason, 'token_mismatch');
  assert.equal((await domainrouting.checkDnsVerification({ hostname: 'h', token, expiresAt: future, resolveTxt: missing })).reason, 'record_not_found');
  assert.equal((await domainrouting.checkDnsVerification({ hostname: 'h', token, expiresAt: new Date(1), resolveTxt: good, now: 1000 })).reason, 'verification_expired');
});

test('caddy: maintenance mode serves a 503; canonical redirect renders', () => {
  const m = caddy.renderRoute({ slug: 'app', port: 3000, visibility: 'public', maintenance: { message: 'Back soon' } });
  assert.match(m, /respond "Back soon" 503/);
  assert.doesNotMatch(m, /reverse_proxy/, 'maintenance does not proxy to the app');

  const r = caddy.renderCanonicalRedirect(['www.example.com', 'example.com'], 'example.com');
  assert.match(r, /^www\.example\.com \{/m, 'only the non-canonical host redirects');
  assert.match(r, /redir https:\/\/example\.com\{uri\} permanent/);
  assert.equal(caddy.renderCanonicalRedirect(['example.com'], 'example.com'), '', 'canonical host does not redirect to itself');
});

// ── DB-backed ───────────────────────────────────────────────────────────────

const { hasDb, prisma, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('v4 phase 4 backend db tests (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
  return;
}

const { orgRepo, systemRepo, domainRepo, maintenanceRepo, routeRepo } = require('../src/repo');
const { buildApp } = require('../src/app');

let app; let cookie; let csrf; let org;
const auth = () => ({ cookie, 'x-csrf-token': csrf });
const flagOn = () => { process.env.ENABLE_V4_SYSTEMS = 'true'; };
const flagOff = () => { delete process.env.ENABLE_V4_SYSTEMS; };

before(async () => {
  flagOff();
  await resetDb();
  app = await buildApp();
  await app.ready();
  org = await orgRepo.ensureDefault();
  await prisma.user.create({ data: { username: 'root', passwordHash: bcrypt.hashSync('correct-horse-battery', 12) } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery' } });
  cookie = login.headers['set-cookie'].split(';')[0];
  csrf = login.json().csrfToken;
});

after(async () => {
  flagOff();
  domainrouting.setResolver(null);
  routepublish.setDeps(null);
  if (app) await app.close();
  await prisma.$disconnect();
});

afterEach(() => { domainrouting.setResolver(null); });

test('domains namespace is dark with the flag off', async () => {
  const sys = await systemRepo.create(org.id, { name: 'dark', slug: 'dark' });
  const res = await app.inject({ method: 'GET', url: `/api/systems/${sys.id}/domains`, headers: auth() });
  assert.equal(res.statusCode, 404);
});

test('registering a custom domain issues DNS verification instructions', async () => {
  flagOn();
  try {
    const sys = await systemRepo.create(org.id, { name: 'verify', slug: 'verify' });
    const res = await app.inject({
      method: 'POST', url: `/api/systems/${sys.id}/domains`, headers: auth(),
      payload: { hostname: 'shop.example.com' },
    });
    assert.equal(res.statusCode, 201, res.payload);
    const body = res.json();
    assert.equal(body.verification.status, 'pending');
    assert.equal(body.verification.record.type, 'TXT');
    assert.equal(body.verification.record.name, '_systems-verify.shop.example.com');
    const domain = await domainRepo.findById(org.id, body.domain.id);
    assert.ok(domain.verificationToken);
    assert.equal(domain.verified, false);
  } finally { flagOff(); }
});

test('verify endpoint marks the domain verified when the TXT record matches, 409s otherwise', async () => {
  flagOn();
  try {
    const sys = await systemRepo.create(org.id, { name: 'verify2', slug: 'verify2' });
    const created = await app.inject({
      method: 'POST', url: `/api/systems/${sys.id}/domains`, headers: auth(),
      payload: { hostname: 'go.example.com' },
    });
    const domainId = created.json().domain.id;
    const token = (await domainRepo.findById(org.id, domainId)).verificationToken;

    domainrouting.setResolver(async (name) => {
      assert.equal(name, '_systems-verify.go.example.com');
      return [[`systems-verify=${token}`]];
    });
    const ok = await app.inject({ method: 'POST', url: `/api/systems/${sys.id}/domains/${domainId}/verify`, headers: auth() });
    assert.equal(ok.statusCode, 200, ok.payload);
    assert.equal(ok.json().verified, true);
    assert.equal((await domainRepo.findById(org.id, domainId)).verified, true);

    const sys2 = await systemRepo.create(org.id, { name: 'verify3', slug: 'verify3' });
    const c2 = await app.inject({ method: 'POST', url: `/api/systems/${sys2.id}/domains`, headers: auth(), payload: { hostname: 'no.example.com' } });
    const d2 = c2.json().domain.id;
    domainrouting.setResolver(async () => [['systems-verify=wrong']]);
    const bad = await app.inject({ method: 'POST', url: `/api/systems/${sys2.id}/domains/${d2}/verify`, headers: auth() });
    assert.equal(bad.statusCode, 409);
    assert.equal(bad.json().reason, 'token_mismatch');
    assert.equal((await domainRepo.findById(org.id, d2)).lastError, 'token_mismatch');
  } finally { flagOff(); }
});

test('canonical requires verification; maintenance CRUD works and is active-aware', async () => {
  flagOn();
  try {
    const sys = await systemRepo.create(org.id, { name: 'canon', slug: 'canon' });
    const created = await app.inject({ method: 'POST', url: `/api/systems/${sys.id}/domains`, headers: auth(), payload: { hostname: 'canon.example.com' } });
    const domainId = created.json().domain.id;

    const blocked = await app.inject({ method: 'POST', url: `/api/systems/${sys.id}/domains/${domainId}/canonical`, headers: auth() });
    assert.equal(blocked.statusCode, 409);

    await domainRepo.markVerified(org.id, domainId);
    const okCanon = await app.inject({ method: 'POST', url: `/api/systems/${sys.id}/domains/${domainId}/canonical`, headers: auth() });
    assert.equal(okCanon.statusCode, 200);
    assert.equal((await domainRepo.findById(org.id, domainId)).isCanonical, true);

    const now = Date.now();
    const win = await app.inject({
      method: 'POST', url: `/api/systems/${sys.id}/maintenance`, headers: auth(),
      payload: { message: 'Upgrading', startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 3_600_000).toISOString() },
    });
    assert.equal(win.statusCode, 201, win.payload);
    const winId = win.json().window.id;

    const active = await maintenanceRepo.activeFor(org.id, sys.id, null, new Date(now));
    assert.ok(active, 'window is active now');

    const list = await app.inject({ method: 'GET', url: `/api/systems/${sys.id}/maintenance`, headers: auth() });
    assert.equal(list.json().windows.length, 1);

    const del = await app.inject({ method: 'DELETE', url: `/api/systems/${sys.id}/maintenance/${winId}`, headers: auth() });
    assert.equal(del.statusCode, 200);
    assert.equal((await maintenanceRepo.listBySystem(org.id, sys.id)).length, 0);
  } finally { flagOff(); }
});

test('route publication transaction persists status: active on success, failed on probe error', async () => {
  const sys = await systemRepo.create(org.id, { name: 'pub', slug: 'pub' });
  const env = sys.environments[0];
  const domain = await domainRepo.createCustom(org.id, { systemId: sys.id, hostname: 'pub.example.com' });

  routepublish.setDeps({
    caddy: { writeRoute: async () => ({ written: true }), validate: async () => ({ ok: true }), reload: async () => ({ ok: true }) },
    health: { targetForPort: (p) => ({ p }), waitForHealthy: async () => {} },
  });
  const okRes = await routepublish.publishRoute({
    organisationId: org.id, system: sys, environment: env, domain,
    renderOpts: { slug: 'pub', port: 4100, visibility: 'public' },
  });
  assert.equal(okRes.status, 'active');
  let freshEnv = await prisma.systemEnvironment.findUnique({ where: { id: env.id } });
  assert.equal(freshEnv.routeStatus, 'active');
  assert.equal(freshEnv.routePublished, true, 'legacy boolean mirrors active');
  assert.ok(freshEnv.routeLastPublishedAt);
  const route = await routeRepo.findRoute(org.id, env.id, domain.id);
  assert.equal(route.routeStatus, 'active');

  routepublish.setDeps({
    caddy: { writeRoute: async () => ({ written: true }), validate: async () => ({ ok: true }), reload: async () => ({ ok: true }) },
    health: { targetForPort: (p) => ({ p }), waitForHealthy: async () => { throw new Error('ECONNREFUSED'); } },
  });
  const failRes = await routepublish.publishRoute({
    organisationId: org.id, system: sys, environment: { ...env, routeStatus: 'active' }, domain,
    renderOpts: { slug: 'pub', port: 4100, visibility: 'public' },
  });
  assert.equal(failRes.status, 'failed');
  assert.match(failRes.error, /probe_failed/);
  freshEnv = await prisma.systemEnvironment.findUnique({ where: { id: env.id } });
  assert.equal(freshEnv.routeStatus, 'failed');
  assert.equal(freshEnv.routePublished, false);

  const attempts = await routeRepo.listAttempts(org.id, sys.id);
  assert.ok(attempts.some((a) => a.status === 'failed'));
  routepublish.setDeps(null);
});
