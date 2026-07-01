#!/usr/bin/env node
'use strict';

// V4 Migration Reconciliation Script
// Run before triggering Phase 2 migration to verify readiness.
//
// Usage:
//   node api/scripts/reconcile-v4-migration.js
//   node api/scripts/reconcile-v4-migration.js --out report.json
//
// Exit codes:
//   0 — all projects mapped, no errors
//   1 — reconciliation errors found
//   2 — fatal (DB connection failure, etc.)

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const { runReconcile } = require('../src/util/v4reconcile');

async function main() {
  const outFlagIdx = process.argv.indexOf('--out');
  const outFile = outFlagIdx !== -1 ? process.argv[outFlagIdx + 1] : null;

  const prisma = new PrismaClient();

  try {
    const report = await runReconcile(prisma);
    const json = JSON.stringify(report, null, 2);

    process.stdout.write(json + '\n');

    if (outFile) {
      fs.writeFileSync(outFile, json, 'utf8');
      process.stderr.write(`[reconcile] Report written to ${outFile}\n`);
    }

    if (report.summary.errors > 0) {
      process.stderr.write(`[reconcile] ${report.summary.errors} error(s) found — migration not safe\n`);
      process.exit(1);
    }
    if (report.summary.warnings > 0) {
      process.stderr.write(`[reconcile] ${report.summary.warnings} warning(s) — review before migrating\n`);
    }
    process.stderr.write(
      `[reconcile] OK — ${report.summary.mapped}/${report.summary.totalProjects} projects ready\n`,
    );
  } catch (err) {
    process.stderr.write(`[reconcile] fatal: ${err.message}\n`);
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

main();
