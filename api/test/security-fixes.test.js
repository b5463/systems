'use strict';

// Regression tests for the audit security fixes:
//   - GET/POST /api/admin/users must never leak password_hash / totp_secret
//   - API tokens must not reach routes they weren't scoped for (default-deny)
//   - a scoped token reaches its own route; 'admin' is a superscope
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'systems-sec-'));
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_MAX = '10000';
process.env.ENABLE_API_TOKENS = 'true';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const { prisma, hasDb, resetDb } = require('./_dbtest');

if (!hasDb) {
  test('security fixes (skipped: set DATABASE_URL to run)', { skip: true }, () => {});
  return;
}

const { buildApp } = require('../src/app');

let app;
let cookie;
let csrf;

before(async () => {
  await resetDb();
  app = await buildApp();
  await app.ready();
  await prisma.user.create({
    data: {
      username: 'root',
      passwordHash: bcrypt.hashSync('correct-horse-battery', 12),
      totpSecret: 'SUPERSECRETTOTPSEED',
      totpEnabled: false,
    },
  });
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery' } });
  cookie = res.headers['set-cookie'].split(';')[0];
  csrf = res.json().csrfToken;
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

const auth = () => ({ cookie, 'x-csrf-token': csrf });

async function mintToken(scopes) {
  const res = await app.inject({
    method: 'POST', url: '/api/auth/tokens', headers: auth(),
    payload: { name: `t-${scopes.join('-')}`, scopes },
  });
  assert.equal(res.statusCode, 200, res.payload);
  return res.json().token;
}

test('admin users list never exposes password_hash or totp_secret', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: auth() });
  assert.equal(res.statusCode, 200);
  const users = res.json().users;
  assert.ok(users.length >= 1);
  for (const u of users) {
    assert.ok(!('password_hash' in u), 'password_hash must not be present');
    assert.ok(!('totp_secret' in u), 'totp_secret must not be present');
    assert.equal(typeof u.username, 'string');
  }
});

test('admin create-user response never exposes secrets', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/admin/users', headers: auth(),
    payload: { username: 'second', password: 'another-long-passphrase' },
  });
  assert.equal(res.statusCode, 201, res.payload);
  const u = res.json().user;
  assert.ok(!('password_hash' in u));
  assert.ok(!('totp_secret' in u));
});

test('a read-scoped token cannot reach admin routes (default-deny)', async () => {
  const token = await mintToken(['read']);
  const res = await app.inject({
    method: 'GET', url: '/api/admin/users',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 403);
});

test('a read-scoped token can reach a read route it was granted', async () => {
  const token = await mintToken(['read']);
  const res = await app.inject({
    method: 'GET', url: '/api/projects',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
});

test('a read-scoped token cannot deploy', async () => {
  const token = await mintToken(['read']);
  const res = await app.inject({
    method: 'POST', url: '/api/deploy',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 403);
});

test('an admin-scoped token is a superscope and reaches read routes', async () => {
  const token = await mintToken(['admin']);
  const res = await app.inject({
    method: 'GET', url: '/api/projects',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
});

test('revoking sessions also revokes the account API tokens', async () => {
  const token = await mintToken(['read']);
  // token works
  let res = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  // break-glass
  const revoke = await app.inject({ method: 'POST', url: '/api/auth/revoke-sessions', headers: auth() });
  assert.equal(revoke.statusCode, 200);
  // token no longer authenticates
  res = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 401);
  // refresh our own session cookie for later tests
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'root', password: 'correct-horse-battery', code: undefined } });
  if (login.statusCode === 200) { cookie = login.headers['set-cookie'].split(';')[0]; csrf = login.json().csrfToken; }
});
