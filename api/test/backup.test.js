'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { backupsToPrune, backupStamp } = require('../src/util/backup');
const { shouldSend, buildPayload } = require('../src/util/notify');

test('backup: prunes oldest beyond retention', () => {
  const entries = [
    { name: 'a', mtimeMs: 1 },
    { name: 'b', mtimeMs: 5 },
    { name: 'c', mtimeMs: 3 },
    { name: 'd', mtimeMs: 2 },
  ];
  // keep newest 2 (b, c); prune d, a
  assert.deepEqual(backupsToPrune(entries, 2).sort(), ['a', 'd']);
  // retention >= count -> nothing pruned
  assert.deepEqual(backupsToPrune(entries, 10), []);
  // invalid retention (0) falls back to the default, so nothing pruned here
  assert.equal(backupsToPrune(entries, 0).length, 0);
});

test('backup: stamp is filesystem-safe and sortable', () => {
  const s = backupStamp(new Date('2026-06-15T09:30:00.123Z'));
  assert.match(s, /^[0-9A-Za-z-]+$/);
  assert.ok(!s.includes(':'));
  assert.ok(!s.includes('.'));
});

test('notify: disabled by default, enabled with flag + url', () => {
  assert.equal(shouldSend({}), false);
  assert.equal(shouldSend({ ENABLE_NOTIFICATIONS: 'true' }), false); // no url
  assert.equal(shouldSend({ ENABLE_NOTIFICATIONS: 'true', NOTIFY_WEBHOOK_URL: 'https://x' }), true);
});

test('notify: payload shape', () => {
  const p = buildPayload({ kind: 'deploy', slug: 'app', detail: 'ok' }, { BASE_DOMAIN: 'acronym.sk' });
  assert.equal(p.source, 'SYSTEMS.');
  assert.equal(p.kind, 'deploy');
  assert.equal(p.slug, 'app');
  assert.equal(p.site, 'acronym.sk');
  assert.match(p.at, /\dT\d/);
});
