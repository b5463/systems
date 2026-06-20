'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.SYSTEMS_ATTESTATION_SECRET = 'test-attestation-secret-32-characters-minimum';
const caddy = require('../src/services/caddy');

process.env.BASE_DOMAIN = 'acronym.sk';

test('public route: reverse_proxy to the mapped host port, no auth', () => {
  const out = caddy.renderRoute({ slug: 'portfolio', port: 3000, visibility: 'public' });
  assert.match(out, /^portfolio\.acronym\.sk \{/m);
  assert.match(out, /reverse_proxy host.docker.internal:3000/);
  assert.doesNotMatch(out, /basic_auth/);
  assert.match(out, /handle \/\.well-known\/systems\/v1\/attestation/);
  assert.match(out, /header_up X-Systems-Route-Credential [A-Za-z0-9_-]{43}/);
  assert.match(out, /rewrite \* \/api\/internal\/attestation\/portfolio/);
});

test('password route: includes basic_auth with the bcrypt hash', () => {
  const out = caddy.renderRoute({ slug: 'notes', port: 3000, visibility: 'password', basicUser: 'admin', basicHash: '$2b$12$EXAMPLEHASH' });
  assert.match(out, /basic_auth \{/);
  assert.match(out, /admin \$2b\$12\$EXAMPLEHASH/);
  assert.match(out, /reverse_proxy host.docker.internal:3000/);
});

test('apex route: primary system also serves the bare base domain', () => {
  const out = caddy.renderRoute({ slug: 'portfolio', port: 3000, visibility: 'public', apex: true });
  // both the subdomain and the apex host on the same site block
  assert.match(out, /^portfolio\.acronym\.sk, acronym\.sk \{/m);
  assert.match(out, /reverse_proxy host.docker.internal:3000/);
  assert.match(out, /\(public, apex\)/);
});

test('non-apex route does not include the bare base domain', () => {
  const out = caddy.renderRoute({ slug: 'portfolio', port: 3000, visibility: 'public' });
  assert.doesNotMatch(out, /, acronym\.sk \{/);
});

test('writeRoute: public writes a file; private writes none', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caddy-'));
  process.env.CADDY_SYSTEMS_DIR = dir;

  const pub = await caddy.writeRoute({ slug: 'demo', port: 3000, visibility: 'public' });
  assert.equal(pub.written, true);
  assert.ok(fs.existsSync(path.join(dir, 'demo.caddy')));

  // switching to private must remove the public route file
  const priv = await caddy.writeRoute({ slug: 'demo', port: 3000, visibility: 'private' });
  assert.equal(priv.written, false);
  assert.equal(fs.existsSync(path.join(dir, 'demo.caddy')), false);
});

test('writeRoute rejects invalid slug', async () => {
  await assert.rejects(() => caddy.writeRoute({ slug: '../evil', visibility: 'public' }), /invalid slug/);
});
