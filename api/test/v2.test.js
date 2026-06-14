'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const flags = require('../src/util/flags');
const pt = require('../src/util/projectType');
const dbp = require('../src/util/dbprovision');
const up = require('../src/util/upload');
const wh = require('../src/util/webhook');

// ---- feature flags ----
test('flags: risky features off by default', () => {
  const f = flags.features({});
  assert.equal(f.dockerfileMode, false);
  assert.equal(f.shellConsole, false);
  assert.equal(f.githubDeploys, false);
  assert.equal(f.dbProvisioning, false);
  assert.equal(f.dbMode, 'shared');
  assert.equal(f.v2UploadMaxMb, 2048);
});
test('flags: enabled via env', () => {
  const f = flags.features({ ENABLE_DOCKERFILE_MODE: 'true', ENABLE_SHELL_CONSOLE: '1', DB_MODE: 'per-project' });
  assert.equal(f.dockerfileMode, true);
  assert.equal(f.shellConsole, true);
  assert.equal(f.dbMode, 'per-project');
});

// ---- project classification ----
test('projectType: vue build', () => {
  const i = pt.classify(['package.json', 'vite.config.js', 'src'], { dependencies: { vue: '^3' }, scripts: { build: 'vite build' } });
  assert.equal(i.type, 'vue');
  assert.equal(pt.routesByDefault(i), true);
});
test('projectType: node API', () => {
  const i = pt.classify(['package.json', 'server.js'], { dependencies: { express: '^4' }, scripts: { start: 'node server.js' } });
  assert.equal(i.type, 'node-api');
  assert.equal(i.isApi, true);
  assert.equal(pt.defaultHealthPath(i), '/health');
});
test('projectType: worker (start, no build, no server)', () => {
  const i = pt.classify(['package.json'], { scripts: { start: 'node bot.js' } });
  assert.equal(i.type, 'worker');
  assert.equal(i.isWorker, true);
  assert.equal(pt.routesByDefault(i), false); // workers get NO public route
});
test('projectType: dockerfile + static', () => {
  assert.equal(pt.classify(['Dockerfile', 'package.json'], {}).type, 'dockerfile');
  assert.equal(pt.classify(['index.html']).type, 'static');
});

// ---- db provisioning helpers ----
test('dbprovision: safe names + masked url', () => {
  assert.equal(dbp.dbName('my-app'), 'sys_my_app');
  assert.equal(dbp.dbUser('my-app'), 'sys_my_app_app');
  assert.throws(() => dbp.dbName('../evil'));
  const url = dbp.databaseUrl({ user: 'sys_my_app_app', password: 'p@ss/w:rd', host: 'postgres', db: 'sys_my_app' });
  assert.match(url, /^postgresql:\/\//);
  assert.match(url, /postgres:5432\/sys_my_app$/);
  const masked = dbp.maskUrl(url);
  assert.ok(!masked.includes('p@ss'));
  assert.match(masked, /••••/);
});
test('dbprovision: password is random + url-safe', () => {
  const a = dbp.genPassword(); const b = dbp.genPassword();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

// ---- chunked upload validation ----
test('upload: rejects oversize + bad chunk meta', () => {
  assert.equal(up.validateChunk({ index: 0, total: 2, chunkSize: 1000, totalSize: 1000 }, { maxMb: 2048 }), null);
  assert.match(up.validateChunk({ index: 0, total: 1, chunkSize: 1, totalSize: up.mb(3000) }, { maxMb: 2048 }), /exceeds/);
  assert.match(up.validateChunk({ index: 5, total: 2, chunkSize: 1, totalSize: 1 }), /out of range/);
});
test('upload: disk fit + traversal-safe temp path + progress', () => {
  assert.equal(up.fitsOnDisk(up.mb(100), up.mb(50)), false);
  assert.equal(up.fitsOnDisk(up.mb(100), up.mb(1000)), true);
  assert.equal(up.uploadTempPath('/tmp/up', '../etc'), null);
  assert.ok(up.uploadTempPath('/tmp/up', 'a1b2c3d4e5f6').endsWith('a1b2c3d4e5f6.part'));
  assert.equal(up.progressState({ cancelled: true }), 'cancelled');
  assert.equal(up.progressState({ received: 50, total: 100 }), 'uploading');
  assert.equal(up.progressState({ received: 100, total: 100 }), 'assembling');
});

// ---- github webhook ----
test('webhook: HMAC sha256 verify (constant-time) + branch filter', () => {
  const crypto = require('node:crypto');
  const secret = 's3cret'; const body = Buffer.from(JSON.stringify({ ok: true }));
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(wh.verifySignature(secret, body, sig), true);
  assert.equal(wh.verifySignature(secret, body, 'sha256=deadbeef'), false);
  assert.equal(wh.verifySignature('wrong', body, sig), false);
  assert.equal(wh.branchAllowed('refs/heads/main', 'main'), true);
  assert.equal(wh.branchAllowed('refs/heads/dev', 'main'), false);
});
