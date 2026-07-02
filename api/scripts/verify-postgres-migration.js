#!/usr/bin/env node
'use strict';

// V4 Phase 1 — verify a PostgreSQL control-plane database.
//
// Checks that DATABASE_URL points at a healthy, fully migrated database:
//   1. connection works
//   2. every migration in prisma/migrations is applied (no pending, no unknown)
//   3. core tables exist and report row counts
//   4. both audit hash chains verify
//
// Run after migrating a legacy SQLite install (migrate-sqlite-to-postgres.js)
// or after a restore. Exits non-zero on any failure so it can gate scripts.
//
// Usage: DATABASE_URL=postgresql://... node scripts/verify-postgres-migration.js

const path = require('path');
const fs = require('fs');

const CORE_TABLES = [
  'users', 'projects', 'audit_log', 'sessions', 'ip_bans', 'platform_settings',
  'deploy_history', 'stats_history', 'jobs',
  'organisations', 'admin_users', 'admin_sessions', 'audit_log_v4',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('FAIL: DATABASE_URL is not set.');
    process.exit(1);
  }

  const { prisma } = require('../src/repo/client');
  const failures = [];

  // 1. Connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('ok  connection');
  } catch (e) {
    console.error(`FAIL connection: ${e.message}`);
    process.exit(1);
  }

  // 2. Migration state: on-disk vs applied
  const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
  const onDisk = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  let applied = [];
  try {
    applied = await prisma.$queryRaw`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY migration_name`;
  } catch {
    failures.push('_prisma_migrations table missing — run `prisma migrate deploy` first');
  }
  const appliedNames = new Set(applied.map((m) => m.migration_name));
  const pending = onDisk.filter((n) => !appliedNames.has(n));
  const unknown = [...appliedNames].filter((n) => !onDisk.includes(n));
  if (pending.length) failures.push(`pending migrations: ${pending.join(', ')}`);
  if (unknown.length) failures.push(`applied migrations unknown to this checkout: ${unknown.join(', ')}`);
  if (!pending.length && !unknown.length && appliedNames.size) {
    console.log(`ok  migrations (${appliedNames.size} applied, 0 pending)`);
  }

  // 3. Core tables + row counts
  for (const table of CORE_TABLES) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${table}"`);
      console.log(`ok  table ${table} (${rows[0].c} rows)`);
    } catch {
      failures.push(`table missing: ${table}`);
    }
  }

  // 4. Audit chains
  try {
    const legacy = await require('../src/repo/audit').verifyAuditChain();
    if (legacy.ok) console.log(`ok  legacy audit chain (${legacy.verified} verified)`);
    else failures.push(`legacy audit chain broken at id ${legacy.brokenAtId}: ${legacy.reason}`);
  } catch (e) {
    failures.push(`legacy audit chain check failed: ${e.message}`);
  }
  try {
    const v4 = await require('../src/repo/auditv4').verify();
    if (v4.ok) console.log(`ok  v4 audit chain (${v4.verified} verified)`);
    else failures.push(`v4 audit chain broken at id ${v4.brokenAtId}: ${v4.reason}`);
  } catch (e) {
    failures.push(`v4 audit chain check failed: ${e.message}`);
  }

  await prisma.$disconnect();

  if (failures.length) {
    console.error('\nVERIFICATION FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nVerification passed.');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
