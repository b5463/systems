'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const enabled = process.env.RUN_DOCKER_E2E === '1' || process.env.npm_lifecycle_event === 'test:e2e';

// Minimal stored-entry ZIP writer. Keeping this local avoids adding a package
// solely to create the two tiny fixture archives used by the host E2E test.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [filename, value] of Object.entries(entries)) {
    const name = Buffer.from(filename);
    const data = Buffer.from(value);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

async function waitFor(fn, description, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}${last ? `: ${last.message}` : ''}`);
}

test('Docker E2E: zip → deploy → HTTP 200 → redeploy → rollback', {
  skip: !enabled,
  timeout: 240000,
}, async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'systems-deploy-e2e-'));
  const slug = `e2e-${Date.now().toString(36)}`;
  Object.assign(process.env, {
    DATA_DIR: dataDir,
    SYSTEMS_DATA_DIR: dataDir,
    TMP_DIR: path.join(dataDir, 'tmp'),
    DEPLOYMENTS_DIR: path.join(dataDir, 'releases'),
    ADMIN_USERS: 'e2e:deploy-test-password',
    JWT_SECRET: 'e2e-jwt-secret-that-is-long-enough-for-this-test',
    ENV_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    LOCAL_MODE: 'true',
    REVERSE_PROXY: 'nginx',
    RECONCILE_INTERVAL_SEC: '0',
  });

  const { db, initDefaultUsers } = require('../src/db');
  await initDefaultUsers();
  const { buildApp } = require('../src/app');
  const app = await buildApp({ logger: false });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  let token;

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(`${origin}${url}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    assert.ok(response.ok, `${options.method || 'GET'} ${url}: ${response.status} ${JSON.stringify(body)}`);
    return body;
  }

  async function upload(url, archive, fields = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set('file', new Blob([archive], { type: 'application/zip' }), 'system.zip');
    return api(url, { method: 'POST', body: form });
  }

  async function project() {
    return (await api(`/api/projects/${slug}`)).project;
  }

  async function servedText(port) {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    return response.text();
  }

  t.after(async () => {
    if (token) {
      await api(`/api/projects/${slug}/purge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: slug }),
      }).catch(() => {});
    }
    await app.close().catch(() => {});
    db.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'e2e', password: 'deploy-test-password' }),
  });
  token = login.token;

  const v1 = zip({ 'index.html': '<!doctype html><title>v1</title><h1>deploy-e2e-v1</h1>' });
  await upload('/api/deploy', v1, { name: 'Deploy E2E', slug, visibility: 'private' });
  const first = await waitFor(async () => {
    const p = await project();
    if (p.status === 'error') throw new Error(`${p.last_error_stage}: ${p.last_error}`);
    return p.status === 'running' ? p : null;
  }, 'initial deployment');
  assert.match(await servedText(first.port), /deploy-e2e-v1/);
  await waitFor(async () => (await project()).health_state === 'healthy', 'automatic local health check', 20000);

  const firstImage = first.image_id;
  const v2 = zip({ 'index.html': '<!doctype html><title>v2</title><h1>deploy-e2e-v2</h1>' });
  await upload(`/api/deploy/${slug}/redeploy`, v2);
  const second = await waitFor(async () => {
    const p = await project();
    if (p.status === 'error') throw new Error(`${p.last_error_stage}: ${p.last_error}`);
    return p.status === 'running' && p.image_id !== firstImage ? p : null;
  }, 'redeployment');
  assert.match(await servedText(second.port), /deploy-e2e-v2/);

  await api(`/api/projects/${slug}/rollback`, { method: 'POST' });
  const rolledBack = await waitFor(async () => {
    const p = await project();
    return p.status === 'running' && p.image_id === firstImage ? p : null;
  }, 'rollback');
  assert.match(await servedText(rolledBack.port), /deploy-e2e-v1/);
});
