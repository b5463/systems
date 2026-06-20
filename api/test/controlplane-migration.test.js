'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  TABLES, quoteIdent, postgresType, createTableSql, insertSql,
} = require('../src/util/controlplane-migration');

test('control-plane migration allowlist covers durable platform state', () => {
  for (const table of ['users', 'projects', 'audit_log', 'sessions', 'ip_bans', 'platform_settings']) {
    assert.ok(TABLES.includes(table));
  }
});

test('control-plane migration quotes identifiers and rejects injection', () => {
  assert.equal(quoteIdent('systems_import'), '"systems_import"');
  assert.throws(() => quoteIdent('public; DROP SCHEMA public'), /Unsafe SQL identifier/);
});

test('control-plane migration maps SQLite types and emits parameterized SQL', () => {
  assert.equal(postgresType('INTEGER'), 'BIGINT');
  assert.equal(postgresType('REAL'), 'DOUBLE PRECISION');
  assert.equal(postgresType('BLOB'), 'BYTEA');
  assert.equal(postgresType('TEXT'), 'TEXT');

  const columns = [
    { name: 'id', type: 'INTEGER', notnull: 1, pk: 1 },
    { name: 'slug', type: 'TEXT', notnull: 1, pk: 0 },
  ];
  assert.equal(
    createTableSql('systems_import', 'projects', columns),
    'CREATE TABLE IF NOT EXISTS "systems_import"."projects" ("id" BIGINT NOT NULL PRIMARY KEY, "slug" TEXT NOT NULL)',
  );
  assert.equal(
    insertSql('systems_import', 'projects', columns),
    'INSERT INTO "systems_import"."projects" ("id", "slug") VALUES ($1, $2)',
  );
});
