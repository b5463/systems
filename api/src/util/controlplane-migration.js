'use strict';

const TABLES = Object.freeze([
  'users', 'projects', 'audit_log', 'sessions', 'ip_bans',
  'platform_settings', 'deploy_history', 'stats_history',
]);

function quoteIdent(value) {
  const s = String(value);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error('Unsafe SQL identifier: ' + s);
  return '"' + s + '"';
}

function postgresType(sqliteType = '') {
  const type = String(sqliteType).toUpperCase();
  if (type.includes('INT')) return 'BIGINT';
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'DOUBLE PRECISION';
  if (type.includes('BLOB')) return 'BYTEA';
  return 'TEXT';
}

function createTableSql(schema, table, columns) {
  if (!columns.length) throw new Error('Cannot create a table without columns');
  const defs = columns.map((column) => {
    const parts = [quoteIdent(column.name), postgresType(column.type)];
    if (column.notnull) parts.push('NOT NULL');
    if (column.pk) parts.push('PRIMARY KEY');
    return parts.join(' ');
  });
  return 'CREATE TABLE IF NOT EXISTS ' + quoteIdent(schema) + '.' + quoteIdent(table) + ' (' + defs.join(', ') + ')';
}

function insertSql(schema, table, columns) {
  const names = columns.map((column) => quoteIdent(column.name)).join(', ');
  const params = columns.map((_, index) => '$' + (index + 1)).join(', ');
  return 'INSERT INTO ' + quoteIdent(schema) + '.' + quoteIdent(table) + ' (' + names + ') VALUES (' + params + ')';
}

module.exports = { TABLES, quoteIdent, postgresType, createTableSql, insertSql };