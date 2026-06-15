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
let token;

before(async () => {
  app = await buildApp();
  await app.ready();
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('root', bcrypt.hashSync('password123', 12));
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'password123' } });
  token = res.json().token;
});

after(async () => { if (app) await app.close(); });

const auth = () => ({ authorization: `Bearer ${token}` });

test('auth: protected routes reject missing token', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  assert.equal(res.statusCode, 401);
});

test('auth: login issues a usable token', async () => {
  assert.ok(token && token.length > 20);
  const res = await app.inject({ method: 'GET', url: '/api/projects', headers: auth() });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().projects, []);
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
  const second = await app.inject({ method: 'POST', url: '/api/admin/users', headers: auth(), payload: { username: 'second', password: 'password123' } });
  assert.equal(second.statusCode, 201);
  const third = await app.inject({ method: 'POST', url: '/api/admin/users', headers: auth(), payload: { username: 'third', password: 'password123' } });
  assert.equal(third.statusCode, 409);
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

test('2fa: setup -> enable -> login requires code', async () => {
  const setup = await app.inject({ method: 'POST', url: '/api/auth/2fa/setup', headers: auth() });
  assert.equal(setup.statusCode, 200);
  const secret = setup.json().secret;
  const code = totp.totp(secret);
  const enable = await app.inject({ method: 'POST', url: '/api/auth/2fa/enable', headers: auth(), payload: { code } });
  assert.equal(enable.statusCode, 200);

  // Login without code now demands a second factor.
  const noCode = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'password123' } });
  assert.equal(noCode.statusCode, 401);
  assert.equal(noCode.json().twoFactorRequired, true);

  // Login with a valid code succeeds.
  const withCode = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'password123', code: totp.totp(secret) } });
  assert.equal(withCode.statusCode, 200);
  assert.ok(withCode.json().token);
});

test('sessions: changing password revokes old tokens', async () => {
  // Get a fresh token (2fa is on now), then change password and confirm the
  // pre-change token stops working.
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'password123', code: totp.totp(db.prepare('SELECT totp_secret FROM users WHERE username = ?').get('root').totp_secret) } });
  const oldToken = login.json().token;

  const change = await app.inject({
    method: 'POST', url: '/api/auth/change-password',
    headers: { authorization: `Bearer ${oldToken}` },
    payload: { currentPassword: 'password123', newPassword: 'password456' },
  });
  assert.equal(change.statusCode, 200);
  const newToken = change.json().token;

  // Old token is now rejected; the freshly issued one works.
  const oldUse = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${oldToken}` } });
  assert.equal(oldUse.statusCode, 401);
  const newUse = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${newToken}` } });
  assert.equal(newUse.statusCode, 200);
});
