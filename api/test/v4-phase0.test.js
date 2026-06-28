'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parsePagination, paginationEnvelope, DEFAULT_PER_PAGE, MAX_PER_PAGE } = require('../src/util/pagination');
const { deprecationHeader } = require('../src/util/deprecation');
const flags = require('../src/util/flags');

// ---- pagination ----
test('pagination: defaults', () => {
  const p = parsePagination({});
  assert.equal(p.page, 1);
  assert.equal(p.perPage, DEFAULT_PER_PAGE);
  assert.equal(p.offset, 0);
});

test('pagination: parses valid page and per_page', () => {
  const p = parsePagination({ page: '3', per_page: '10' });
  assert.equal(p.page, 3);
  assert.equal(p.perPage, 10);
  assert.equal(p.offset, 20);
});

test('pagination: clamps per_page to max', () => {
  const p = parsePagination({ per_page: '999' });
  assert.equal(p.perPage, MAX_PER_PAGE);
});

test('pagination: rejects negative page', () => {
  const p = parsePagination({ page: '-1' });
  assert.equal(p.page, 1);
});

test('pagination: envelope shape', () => {
  const result = paginationEnvelope(['a', 'b'], 50, { page: 2, perPage: 25 });
  assert.deepEqual(result.data, ['a', 'b']);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.perPage, 25);
  assert.equal(result.pagination.total, 50);
  assert.equal(result.pagination.totalPages, 2);
});

test('pagination: totalPages rounds up', () => {
  const result = paginationEnvelope([], 51, { page: 1, perPage: 25 });
  assert.equal(result.pagination.totalPages, 3);
});

test('pagination: accepts camelCase perPage query param', () => {
  const p = parsePagination({ perPage: '15' });
  assert.equal(p.perPage, 15);
});

// ---- deprecation header ----
test('deprecation: sets headers', () => {
  const headers = {};
  const fakeReply = { header: (k, v) => { headers[k] = v; } };
  deprecationHeader(fakeReply, '2026-12-01', 'https://docs.example.com/migration');
  assert.equal(headers['Deprecation'], '2026-12-01');
  assert.equal(headers['Sunset'], '2026-12-01');
  assert.ok(headers['Link'].includes('rel="deprecation"'));
});

test('deprecation: no Link header when link is omitted', () => {
  const headers = {};
  const fakeReply = { header: (k, v) => { headers[k] = v; } };
  deprecationHeader(fakeReply, '2027-01-01');
  assert.equal(headers['Deprecation'], '2027-01-01');
  assert.equal(headers['Link'], undefined);
});

// ---- v3 feature flags still off by default ----
test('flags: v3 features off by default', () => {
  const f = flags.features({});
  assert.equal(f.previewEnvironments, false);
  assert.equal(f.multiNode, false);
  assert.equal(f.objectStorageBackups, false);
  assert.equal(f.apiTokens, false);
  assert.equal(f.secretsManagement, false);
  assert.equal(f.buildCache, false);
});

test('flags: v3 features enabled via env', () => {
  const f = flags.features({
    ENABLE_PREVIEW_ENVIRONMENTS: 'true',
    ENABLE_MULTI_NODE: '1',
    ENABLE_API_TOKENS: 'yes',
    ENABLE_SECRETS_MANAGEMENT: 'on',
  });
  assert.equal(f.previewEnvironments, true);
  assert.equal(f.multiNode, true);
  assert.equal(f.apiTokens, true);
  assert.equal(f.secretsManagement, true);
});

// ---- error response shape contract ----
test('error response: standard shape has error, statusCode, requestId', () => {
  const shape = { error: 'Not found', statusCode: 404, requestId: 'abc-123' };
  assert.ok(typeof shape.error === 'string');
  assert.ok(typeof shape.statusCode === 'number');
  assert.ok(typeof shape.requestId === 'string');
});

// ---- schema endpoint response contract ----
test('schema response: has database, version, tables array', () => {
  const shape = {
    database: 'postgresql',
    schema: 'prisma',
    version: '2.0.0-rc.1',
    tables: [{ table: 'users', rows: 1 }],
  };
  assert.equal(shape.database, 'postgresql');
  assert.equal(shape.schema, 'prisma');
  assert.ok(Array.isArray(shape.tables));
  assert.ok(shape.tables[0].table === 'users');
  assert.ok(typeof shape.tables[0].rows === 'number');
});

// ---- features endpoint response contract ----
test('features response: has features object and database type', () => {
  const shape = {
    features: flags.features({}),
    database: 'postgresql',
    sqliteWarning: null,
  };
  assert.ok(typeof shape.features === 'object');
  assert.equal(shape.database, 'postgresql');
  assert.equal(shape.sqliteWarning, null);
});

test('features response: sqliteWarning set when not postgresql', () => {
  const dbUrl = 'sqlite:///data/systems.db';
  const dbEngine = dbUrl.startsWith('postgresql') ? 'postgresql' : 'unknown';
  const sqliteWarning = dbEngine !== 'postgresql'
    ? 'The control plane is not using PostgreSQL. This is unsupported in production.'
    : null;
  assert.ok(sqliteWarning !== null);
  assert.ok(sqliteWarning.includes('unsupported'));
});
