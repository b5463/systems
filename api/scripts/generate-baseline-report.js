#!/usr/bin/env node
'use strict';

// V4 Phase 0.5 — baseline snapshot generator.
//
// Records the known-good state of the platform before any V4 data-model or
// route migration work, so later phases can prove they did not silently
// change the base system. Writes docs/V4/baseline/BASELINE.md (+ schema.sql).
//
// Honest-status rule (ADR 0004): anything this environment cannot observe is
// reported as `not_measured`, never guessed.
//
// Usage:
//   DATABASE_URL=postgresql://... node scripts/generate-baseline-report.js
//   (optionally TEST_SUMMARY="180 tests, 179 pass, 1 skipped" LINT_SUMMARY="clean")

const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'V4', 'baseline');

async function routeList() {
  const { buildApp } = require('../src/app');
  const app = await buildApp();
  await app.ready();
  const routes = app.printRoutes({ commonPrefix: false });
  await app.close();
  return routes;
}

async function migrationState(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT migration_name, finished_at FROM _prisma_migrations
    WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  return rows.map((r) => r.migration_name);
}

async function tableInventory(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name);
}

async function schemaDump() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { stdout } = await execFileAsync('pg_dump', [
      '--schema-only', '--no-owner', '--no-privileges', process.env.DATABASE_URL,
    ], { maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

async function dockerInventory() {
  try {
    const dockerService = require('../src/services/docker');
    const docker = dockerService.createDocker();
    await docker.ping();
    const managed = await docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: ['managed=acronym-deploy'] }),
    });
    return managed.map((c) => ({
      name: (c.Names && c.Names[0]) || c.Id.slice(0, 12),
      state: c.State,
      labels: c.Labels,
    }));
  } catch {
    return null; // Docker not observable from here
  }
}

async function caddyInventory() {
  const dir = process.env.CADDY_ROUTES_DIR;
  if (!dir) return null;
  try {
    return await fsp.readdir(dir);
  } catch {
    return null;
  }
}

function featureFlags() {
  const { features } = require('../src/util/flags');
  return features();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required (route + schema snapshots read the live control plane).');
    process.exit(1);
  }
  const { prisma } = require('../src/repo/client');

  const [routes, migrations, tables, dump, docker, caddy] = await Promise.all([
    routeList(),
    migrationState(prisma),
    tableInventory(prisma),
    schemaDump(),
    dockerInventory(),
    caddyInventory(),
  ]);
  await prisma.$disconnect();

  await fsp.mkdir(OUT_DIR, { recursive: true });

  const flags = featureFlags();
  const enabledFlags = Object.entries(flags).filter(([, v]) => v === true).map(([k]) => k);

  const lines = [];
  lines.push('# SYSTEMS. V4 — Phase 0.5 baseline snapshot');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}  `);
  lines.push('**Generator:** `api/scripts/generate-baseline-report.js`  ');
  lines.push('**Rule:** anything the generating environment cannot observe is `not_measured` (ADR 0004).');
  lines.push('');
  lines.push('## Test and lint state');
  lines.push('');
  lines.push(`- npm test: ${process.env.TEST_SUMMARY || 'not_measured (set TEST_SUMMARY when generating)'}`);
  lines.push(`- npm run lint: ${process.env.LINT_SUMMARY || 'not_measured (set LINT_SUMMARY when generating)'}`);
  lines.push('');
  lines.push('## Applied migrations (`_prisma_migrations`)');
  lines.push('');
  for (const m of migrations) lines.push(`- \`${m}\``);
  lines.push('');
  lines.push('## Database tables');
  lines.push('');
  lines.push('```text');
  lines.push(tables.join('\n'));
  lines.push('```');
  lines.push('');
  lines.push('Full schema: [`schema.sql`](./schema.sql)' + (dump ? '' : ' — not_measured (pg_dump unavailable)'));
  lines.push('');
  lines.push('## API route tree');
  lines.push('');
  lines.push('```text');
  lines.push(routes.trimEnd());
  lines.push('```');
  lines.push('');
  lines.push('## Feature flags');
  lines.push('');
  lines.push(enabledFlags.length
    ? enabledFlags.map((f) => `- ${f}: **enabled**`).join('\n')
    : '- all gated features disabled (V2, V3 and V4 flags all default off)');
  lines.push(`- dbMode: \`${flags.dbMode}\``);
  lines.push('');
  lines.push('## Docker containers (managed=acronym-deploy)');
  lines.push('');
  if (docker === null) {
    lines.push('- not_measured (Docker not observable from the generating environment)');
  } else if (!docker.length) {
    lines.push('- none');
  } else {
    for (const c of docker) lines.push(`- ${c.name} (${c.state})`);
  }
  lines.push('');
  lines.push('## Caddy route files');
  lines.push('');
  lines.push(caddy === null
    ? '- not_measured (CADDY_ROUTES_DIR not configured in the generating environment)'
    : (caddy.length ? caddy.map((f) => `- ${f}`).join('\n') : '- none'));
  lines.push('');
  lines.push('## Backup');
  lines.push('');
  lines.push('- mechanism: pg_dump (custom format) + Caddy routes + manifest with `schema_version`');
  lines.push(`- scheduler: ${flags.backupScheduler ? 'enabled' : 'disabled'} (manual backup always available)`);
  lines.push(`- object storage offload: ${flags.objectStorageBackups ? 'enabled' : 'disabled'}`);
  lines.push('');

  await fsp.writeFile(path.join(OUT_DIR, 'BASELINE.md'), lines.join('\n'));
  if (dump) await fsp.writeFile(path.join(OUT_DIR, 'schema.sql'), dump);

  console.log(`Baseline written to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('Baseline generation failed:', e.message);
  process.exit(1);
});
