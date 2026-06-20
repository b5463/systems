'use strict';

// Route-level integration tests. Each test file runs in its own process under
// `node --test`, so we point DATA_DIR at a throwaway dir and exercise the real
// Fastify app via inject() — no port, no Docker.
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'systems-test-'));
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '10000';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const { buildApp } = require('../src/app');
const { db } = require('../src/db');
const totp = require('../src/util/totp');

let app;
let cookie;
let csrf;

before(async () => {
  app = await buildApp();
  await app.ready();
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('root', bcrypt.hashSync('correct-horse-battery', 12));
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery' } });
  cookie = res.headers['set-cookie'].split(';')[0];
  csrf = res.json().csrfToken;
});

after(async () => { if (app) await app.close(); });

const auth = () => ({ cookie, 'x-csrf-token': csrf });

test('auth: protected routes reject a missing session', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  assert.equal(res.statusCode, 401);
});

test('auth: login issues a usable HttpOnly cookie session', async () => {
  assert.match(cookie, /^systems_session=/);
  assert.ok(csrf && csrf.length > 20);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery' } });
  assert.match(login.headers['set-cookie'], /HttpOnly/);
  assert.match(login.headers['set-cookie'], /SameSite=Strict/);
  const res = await app.inject({ method: 'GET', url: '/api/projects', headers: auth() });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().projects, []);
});


test('auth: bearer credentials are not accepted', async () => {
  const raw = cookie.slice(cookie.indexOf('=') + 1);
  const res = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${raw}` } });
  assert.equal(res.statusCode, 401);
});

test('auth: authenticated mutations require the session-bound CSRF token', async () => {
  const missing = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie } });
  assert.equal(missing.statusCode, 403);
  const forged = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie, 'x-csrf-token': 'forged' } });
  assert.equal(forged.statusCode, 403);
  const valid = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: auth() });
  assert.equal(valid.statusCode, 200);
});

test('auth: rejects a cross-origin request even with valid session credentials', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects', headers: { ...auth(), origin: 'https://evil.example' } });
  assert.equal(res.statusCode, 403);
});
test('auth: bad credentials are rejected', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'nope' } });
  assert.equal(res.statusCode, 401);
});

test('projects: unknown slug is 404', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects/ghost', headers: auth() });
  assert.equal(res.statusCode, 404);
});

test('server/info: risky features are off by default', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/server/info', headers: auth() });
  assert.equal(res.statusCode, 200);
  const f = res.json().features;
  assert.equal(f.githubDeploys, false);
  assert.equal(f.largeUploads, false);
  assert.equal(f.shellConsole, false);
});

test('admin: two-admin hard cap enforced', async () => {
  const second = await app.inject({ method: 'POST', url: '/api/admin/users', headers: auth(), payload: { username: 'second', password: 'correct-horse-battery' } });
  assert.equal(second.statusCode, 201);
  const third = await app.inject({ method: 'POST', url: '/api/admin/users', headers: auth(), payload: { username: 'third', password: 'correct-horse-battery' } });
  assert.equal(third.statusCode, 409);
});


test('admin: persistent IP bans validate, enforce, and can be removed', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/admin/ip-bans', headers: auth(),
    payload: { ip: '203.0.113.7', reason: 'security test' },
  });
  assert.equal(created.statusCode, 201);
  const id = created.json().ban.id;

  const blocked = await app.inject({
    method: 'GET', url: '/api/projects', headers: auth(), remoteAddress: '203.0.113.7',
  });
  assert.equal(blocked.statusCode, 403);

  const removed = await app.inject({ method: 'DELETE', url: `/api/admin/ip-bans/${id}`, headers: auth() });
  assert.equal(removed.statusCode, 200);
});
test('admin: CIDR bans block addresses in range and refuse the admin\'s own range', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/admin/ip-bans', headers: auth(),
    payload: { ip: '198.51.100.0/24', reason: 'cidr test' },
  });
  assert.equal(created.statusCode, 201);
  const id = created.json().ban.id;

  const inRange = await app.inject({ method: 'GET', url: '/api/projects', headers: auth(), remoteAddress: '198.51.100.42' });
  assert.equal(inRange.statusCode, 403);
  const outOfRange = await app.inject({ method: 'GET', url: '/api/projects', headers: auth(), remoteAddress: '198.51.101.42' });
  assert.equal(outOfRange.statusCode, 200);

  // The test client's address is 127.0.0.1 — a range containing it must be refused.
  const selfRange = await app.inject({ method: 'POST', url: '/api/admin/ip-bans', headers: auth(), payload: { ip: '127.0.0.0/8' } });
  assert.equal(selfRange.statusCode, 400);
  // An overly broad prefix is rejected outright.
  const broad = await app.inject({ method: 'POST', url: '/api/admin/ip-bans', headers: auth(), payload: { ip: '0.0.0.0/0' } });
  assert.equal(broad.statusCode, 400);

  await app.inject({ method: 'DELETE', url: `/api/admin/ip-bans/${id}`, headers: auth() });
});

test('security: hardened response headers are present on every reply', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects', headers: auth() });
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
  assert.ok(res.headers['permissions-policy']);
  assert.equal(res.headers['x-powered-by'], undefined);
  // HSTS only outside dev (no NODE_ENV=production in tests).
  assert.equal(res.headers['strict-transport-security'], undefined);
});

test('webhook + upload endpoints are 404 while flags are off', async () => {
  const wh = await app.inject({ method: 'POST', url: '/api/webhook/github', headers: { 'x-github-event': 'ping' }, payload: {} });
  assert.equal(wh.statusCode, 404);
  const up = await app.inject({ method: 'POST', url: '/api/upload/init', headers: auth(), payload: { name: 'x', slug: 'x', totalSize: 10, totalChunks: 1 } });
  assert.equal(up.statusCode, 404);
});

test('notify-test reports disabled when notifications are off', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/server/notify-test', headers: auth() });
  assert.equal(res.statusCode, 409);
});

test('primary: set/clear apex on a public system; private rejected', async () => {
  db.prepare(`INSERT INTO projects (name, slug, port, status, visibility) VALUES ('Folio','folio',4400,'running','public')`).run();
  const on = await app.inject({ method: 'PATCH', url: '/api/projects/folio/primary', headers: auth(), payload: { primary: true } });
  assert.equal(on.statusCode, 200);
  assert.equal(on.json().project.is_primary, 1);

  // a private system has no public route, so it can't be primary
  db.prepare(`INSERT INTO projects (name, slug, port, status, visibility) VALUES ('Hidden','hidden',4401,'running','private')`).run();
  const bad = await app.inject({ method: 'PATCH', url: '/api/projects/hidden/primary', headers: auth(), payload: { primary: true } });
  assert.equal(bad.statusCode, 400);

  const off = await app.inject({ method: 'PATCH', url: '/api/projects/folio/primary', headers: auth(), payload: { primary: false } });
  assert.equal(off.statusCode, 200);
  assert.equal(off.json().project.is_primary, 0);
});

test('provision-db is 404 while flag is off', async () => {
  // Need a real system row first so we exercise the flag gate, not the 404.
  db.prepare(`INSERT INTO projects (name, slug, port, status) VALUES ('Prov','prov',4321,'stopped')`).run();
  const res = await app.inject({ method: 'POST', url: '/api/projects/prov/provision-db', headers: auth() });
  assert.equal(res.statusCode, 404);
});

test('repo mapping: validates owner/name and clears on null', async () => {
  db.prepare(`INSERT INTO projects (name, slug, port, status) VALUES ('Repo','repo',4330,'running')`).run();
  const bad = await app.inject({ method: 'PATCH', url: '/api/projects/repo/repo', headers: auth(), payload: { repo: 'not a repo' } });
  assert.equal(bad.statusCode, 400);
  const ok = await app.inject({ method: 'PATCH', url: '/api/projects/repo/repo', headers: auth(), payload: { repo: 'acme/site', branch: 'release' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().project.repo, 'acme/site');
  assert.equal(ok.json().project.deploy_branch, 'release');
  const cleared = await app.inject({ method: 'PATCH', url: '/api/projects/repo/repo', headers: auth(), payload: { repo: null } });
  assert.equal(cleared.json().project.repo, null);
});

test('metrics history: supports seven-day windows with bounded downsampling', async () => {
  const project = db.prepare(`INSERT INTO projects (name, slug, port, status) VALUES ('Metrics','metrics',4332,'running') RETURNING id`).get();
  const insert = db.prepare(`
    INSERT INTO stats_history (project_id, cpu_percent, memory_mb, memory_limit_mb, rx_bytes, tx_bytes, recorded_at)
    VALUES (?, ?, ?, 512, 0, 0, datetime('now', ?))
  `);
  const seed = db.transaction(() => {
    for (let i = 0; i < 400; i += 1) insert.run(project.id, i % 100, 100 + i, `-${i} seconds`);
  });
  seed();

  const response = await app.inject({
    method: 'GET', url: '/api/projects/metrics/stats/history?hours=168', headers: auth(),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().hours, 168);
  assert.equal(response.json().retentionHours, 168);
  assert.ok(response.json().points.length > 0);
  assert.ok(response.json().points.length <= 360);
});
test('limits: persists validated per-system overrides and exposes a stable shape', async () => {
  db.prepare(`INSERT INTO projects (name, slug, port, status) VALUES ('Limited','limited',4331,'running')`).run();
  const saved = await app.inject({
    method: 'PATCH', url: '/api/projects/limited/limits', headers: auth(),
    payload: {
      memoryMb: 768,
      cpuLimit: 1.5,
      pidsLimit: 300,
      restartPolicy: 'on-failure',
      logMaxSize: '25m',
      logMaxFile: 4,
      healthPath: '/ready',
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.json().project.limits, {
    memoryMb: 768,
    cpuLimit: 1.5,
    pidsLimit: 300,
    restartPolicy: 'on-failure',
    logMaxSize: '25m',
    logMaxFile: 4,
    healthPath: '/ready',
  });
  assert.equal(saved.json().appliesOn, 'next-container-recreation');

  const invalid = await app.inject({
    method: 'PATCH', url: '/api/projects/limited/limits', headers: auth(),
    payload: { memoryMb: 32, healthPath: 'ready' },
  });
  assert.equal(invalid.statusCode, 400);
});
test('visibility: rejects an unsafe basic-auth username (Caddy injection guard)', async () => {
  db.prepare(`INSERT INTO projects (name, slug, port, status, visibility) VALUES ('Vis','vis',4322,'running','public')`).run();
  const res = await app.inject({
    method: 'PATCH', url: '/api/projects/vis/visibility', headers: auth(),
    payload: { visibility: 'password', username: 'bad user}', password: 'secretpw' },
  });
  assert.equal(res.statusCode, 400);
});

test('env: rejects values with control characters', async () => {
  db.prepare(`INSERT INTO projects (name, slug, port, status, container_id, image_id) VALUES ('Envx','envx',4323,'running','c1','i1')`).run();
  const res = await app.inject({
    method: 'PUT', url: '/api/projects/envx/env', headers: auth(),
    payload: { vars: { OK: 'fine', BAD: 'line\nbreak' } },
  });
  assert.equal(res.statusCode, 400);
});

test('admin: safe runtime settings are validated, audited, and resettable', async () => {
  const initial = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: auth() });
  assert.equal(initial.statusCode, 200);
  assert.ok(initial.json().settings.some((item) => item.key === 'releaseRetention'));

  const saved = await app.inject({
    method: 'PATCH', url: '/api/admin/settings', headers: auth(),
    payload: { settings: { releaseRetention: 7, notificationFormat: 'slack' } },
  });
  assert.equal(saved.statusCode, 200);
  const retention = saved.json().settings.find((item) => item.key === 'releaseRetention');
  assert.equal(retention.value, 7);
  assert.equal(retention.source, 'database');
  assert.ok(db.prepare("SELECT id FROM audit_log WHERE action = 'settings_update' ORDER BY id DESC LIMIT 1").get());

  const invalid = await app.inject({
    method: 'PATCH', url: '/api/admin/settings', headers: auth(),
    payload: { settings: { releaseRetention: 0 } },
  });
  assert.equal(invalid.statusCode, 400);

  const reset = await app.inject({
    method: 'PATCH', url: '/api/admin/settings', headers: auth(),
    payload: { settings: { releaseRetention: null, notificationFormat: null } },
  });
  assert.equal(reset.statusCode, 200);
  assert.notEqual(reset.json().settings.find((item) => item.key === 'releaseRetention').source, 'database');
});

test('2fa: setup -> enable -> login requires code', async () => {
  const setup = await app.inject({ method: 'POST', url: '/api/auth/2fa/setup', headers: auth() });
  assert.equal(setup.statusCode, 200);
  const secret = setup.json().secret;
  const code = totp.totp(secret);
  const enable = await app.inject({ method: 'POST', url: '/api/auth/2fa/enable', headers: auth(), payload: { code } });
  assert.equal(enable.statusCode, 200);

  // Login without code now demands a second factor.
  const noCode = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery' } });
  assert.equal(noCode.statusCode, 401);
  assert.equal(noCode.json().twoFactorRequired, true);

  // Login with a valid code succeeds.
  const withCode = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery', code: totp.totp(secret) } });
  assert.equal(withCode.statusCode, 200);
  assert.match(withCode.headers['set-cookie'], /HttpOnly/);
  assert.ok(withCode.json().csrfToken);
});

test('sessions: changing password rotates the cookie and revokes the old session', async () => {
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery', code: totp.totp(db.prepare('SELECT totp_secret FROM users WHERE username = ?').get('root').totp_secret) } });
  const oldCookie = login.headers['set-cookie'].split(';')[0];
  const oldCsrf = login.json().csrfToken;

  const change = await app.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { cookie: oldCookie, 'x-csrf-token': oldCsrf },
    payload: { currentPassword: 'correct-horse-battery', newPassword: 'correct-horse-staple' },
  });
  assert.equal(change.statusCode, 200);
  const newCookie = change.headers['set-cookie'].split(';')[0];
  const newCsrf = change.json().csrfToken;
  assert.notEqual(newCookie, oldCookie);

  const oldUse = await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie: oldCookie } });
  assert.equal(oldUse.statusCode, 401);
  const newUse = await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie: newCookie, 'x-csrf-token': newCsrf } });
  assert.equal(newUse.statusCode, 200);
});
