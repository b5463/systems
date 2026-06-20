'use strict';

const path = require('path');
const fs = require('fs/promises');
const Database = require('better-sqlite3');
const { TABLES, quoteIdent, createTableSql, insertSql } = require('../src/util/controlplane-migration');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const sqlitePath = process.env.CONTROL_PLANE_SQLITE_PATH || path.join(dataDir, 'platform.db');
const targetUrl = process.env.CONTROL_PLANE_POSTGRES_URL;
const schema = process.env.CONTROL_PLANE_POSTGRES_SCHEMA || 'systems_import';

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  if (!dryRun && !targetUrl) {
    throw new Error('CONTROL_PLANE_POSTGRES_URL is required (or use --dry-run).');
  }

  const source = new Database(sqlitePath, { readonly: true });
  const backupDir = path.join(dataDir, 'migration-backups');
  await fs.mkdir(backupDir, { recursive: true });
  const runStamp = stamp();
  const backupPath = path.join(backupDir, 'platform-before-postgres-' + runStamp + '.db');
  await source.backup(backupPath);

  const plan = [];
  for (const table of TABLES) {
    const exists = source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    const columns = source.prepare('PRAGMA table_info(' + quoteIdent(table) + ')').all();
    const rows = source.prepare('SELECT * FROM ' + quoteIdent(table)).all();
    plan.push({ table, columns, rows });
  }

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      sqlitePath,
      backupPath,
      schema,
      tables: plan.map((item) => ({ table: item.table, rows: item.rows.length })),
    }, null, 2));
    source.close();
    return;
  }

  const { Client } = require('pg');
  const client = new Client({ connectionString: targetUrl });
  await client.connect();
  const counts = {};
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA IF NOT EXISTS ' + quoteIdent(schema));

    for (const item of plan) {
      await client.query(createTableSql(schema, item.table, item.columns));
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM ' + quoteIdent(schema) + '.' + quoteIdent(item.table)
      );
      if (countResult.rows[0].count !== 0) {
        throw new Error('Refusing non-empty target table: ' + schema + '.' + item.table);
      }
      const sql = insertSql(schema, item.table, item.columns);
      for (const row of item.rows) {
        await client.query(sql, item.columns.map((column) => row[column.name]));
      }
      const verify = await client.query(
        'SELECT COUNT(*)::int AS count FROM ' + quoteIdent(schema) + '.' + quoteIdent(item.table)
      );
      if (verify.rows[0].count !== item.rows.length) {
        throw new Error('Row-count verification failed for ' + item.table);
      }
      counts[item.table] = item.rows.length;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
    source.close();
  }

  const manifestPath = path.join(backupDir, 'postgres-import-' + runStamp + '.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    completedAt: new Date().toISOString(),
    sqlitePath,
    backupPath,
    targetSchema: schema,
    counts,
    note: 'Data copied only. The API backend was not switched automatically.',
  }, null, 2));

  console.log(JSON.stringify({ ok: true, backupPath, manifestPath, schema, counts }, null, 2));
}

main().catch((error) => {
  console.error('[migration] ' + error.message);
  process.exitCode = 1;
});