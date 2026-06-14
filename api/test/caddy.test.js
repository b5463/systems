'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const caddy = require('../src/services/caddy');

process.env.BASE_DOMAIN = 'acronym.sk';

test('public route: reverse_proxy to systems-{slug}, no auth', () => {
  const out = caddy.renderRoute({ slug: 'portfolio', port: 3000, visibility: 'public' });
  assert.match(out, /^portfolio\.acronym\.sk \{/m);
  assert.match(out, /reverse_proxy systems-portfolio:3000/);
  assert.doesNotMatch(out, /basic_auth/);
});

test('password route: includes basic_auth with the bcrypt hash', () => {
  const out = caddy.renderRoute({ slug: 'notes', port: 3000, visibility: 'password', basicUser: 'admin', basicHash: '$2b$12$EXAMPLEHASH' });
  assert.match(out, /basic_auth \{/);
  assert.match(out, /admin \$2b\$12\$EXAMPLEHASH/);
  assert.match(out, /reverse_proxy systems-notes:3000/);
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
