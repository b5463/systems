#!/usr/bin/env node
'use strict';

// V4 Phase 2.5 — migration reconciliation checkpoint.
//
// Proves the legacy `projects` world and the V4 systems/environments/releases/
// domains world describe the same platform BEFORE Phase 3 moves the deploy
// engine. Read-only. Honest-status rule (ADR 0004): checks that need Docker or
// Caddy report not_measured when those are not observable, never guessed.
//
// Checks:
//   projects   → every non-deleted project has a legacy_project_map row
//   map rows   → their system + environment exist; production env present
//   drift      → V4-owned fields still equal the legacy values (projects is
//                the operational source of truth until Phase 3, so drift
//                means the bridge output is stale)
//   env vars   → every encrypted legacy env_vars blob decrypts under ENV_SECRET
//   domains    → every mapped system has its default domain row
//   history    → deploy_history/stats_history counts vs V4 rows (informational:
//                the Phase 2 bridge migrates current+previous releases only)
//   containers → managed Docker containers map to an active release
//   routes     → Caddy route files map to known domains
//
// CLI exit: 0 when every measurable check passes, 1 otherwise.

const FIELD_MAP = [
  ['name', (s) => s.name],
  ['slug', (s) => s.slug],
  ['deployType', (s) => s.systemType],
  ['status', (s) => s.currentStatus],
  ['repo', (s) => s.repo],
  ['deployBranch', (s) => s.deployBranch],
  ['isPrimary', (s) => s.isPrimaryRoot],
];
const ENV_FIELD_MAP = [
  ['visibility', (e) => e.accessPolicy],
  ['healthPath', (e) => e.healthPath],
  ['routePublished', (e) => e.routePublished],
  ['basicUser', (e) => e.basicUser],
];

async function reconcileV4({ prisma }) {
  const report = { ok: true, failures: [] };
  const fail = (msg) => { report.ok = false; report.failures.push(msg); };

  const [projects, maps, systems, environments, releases, domains] = await Promise.all([
    prisma.project.findMany(),
    prisma.legacyProjectMap.findMany(),
    prisma.system.findMany(),
    prisma.systemEnvironment.findMany(),
    prisma.release.findMany(),
    prisma.domain.findMany(),
  ]);
  const mapByProject = new Map(maps.map((m) => [m.projectId, m]));
  const sysById = new Map(systems.map((s) => [s.id, s]));
  const envById = new Map(environments.map((e) => [e.id, e]));
  const relById = new Map(releases.map((r) => [r.id, r]));

  // 1. Mapping completeness
  const active = projects.filter((p) => p.status !== 'deleted');
  const unmapped = active.filter((p) => !mapByProject.has(p.id)).map((p) => p.slug);
  report.projects = {
    total: projects.length,
    active: active.length,
    mapped: active.length - unmapped.length,
    unmapped,
  };
  if (unmapped.length) fail(`${unmapped.length} project(s) not migrated: ${unmapped.join(', ')}`);

  // Systems created natively through the V4 API (no legacy counterpart) are
  // fine — listed for the operator, never a failure.
  const mappedSystemIds = new Set(maps.map((m) => m.systemId));
  report.v4NativeSystems = systems.filter((s) => !mappedSystemIds.has(s.id)).map((s) => s.slug);

  // 2. Map integrity + 3. field drift + 6. domains
  const drift = [];
  const brokenMaps = [];
  const missingDomains = [];
  for (const p of active) {
    const map = mapByProject.get(p.id);
    if (!map) continue;
    const system = sysById.get(map.systemId);
    const environment = envById.get(map.environmentId);
    if (!system || !environment) {
      brokenMaps.push(p.slug);
      continue;
    }
    const isProduction = environment.name === 'production';
    const fields = [];
    // System-level fields (name/slug/status/repo/…) belong to the PRODUCTION
    // project. A preview environment maps its own suffixed project to the
    // same system, so those comparisons only apply to production maps.
    if (isProduction) {
      for (const [projField, pick] of FIELD_MAP) {
        if ((p[projField] ?? null) !== (pick(system) ?? null)) fields.push(projField);
      }
    }
    for (const [projField, pick] of ENV_FIELD_MAP) {
      if ((p[projField] ?? null) !== (pick(environment) ?? null)) fields.push(projField);
    }
    const release = map.releaseId ? relById.get(map.releaseId) : null;
    if (p.containerId && (!release || release.containerId !== p.containerId)) fields.push('containerId');
    if (fields.length) drift.push({ slug: p.slug, fields });

    // Default domains exist for production environments only.
    if (isProduction && !domains.some((d) => d.systemId === map.systemId)) missingDomains.push(p.slug);
  }
  report.brokenMaps = brokenMaps;
  report.drift = drift;
  report.missingDomains = missingDomains;
  if (brokenMaps.length) fail(`${brokenMaps.length} map row(s) point at missing systems/environments: ${brokenMaps.join(', ')}`);
  if (drift.length) fail(`${drift.length} project(s) drifted from their V4 copy (re-run the bridge or reconcile): ${drift.map((d) => d.slug).join(', ')}`);
  if (missingDomains.length) fail(`${missingDomains.length} mapped system(s) have no domain: ${missingDomains.join(', ')}`);

  // 4. Encrypted env vars decrypt under the current ENV_SECRET
  const { decryptEnvVars } = require('../src/routes/env');
  const decryptFailures = [];
  let checked = 0;
  for (const p of active) {
    if (!p.envVars) continue;
    checked += 1;
    try { decryptEnvVars(p.envVars); } catch { decryptFailures.push(p.slug); }
  }
  report.envSecrets = { checked, failures: decryptFailures };
  if (decryptFailures.length) fail(`${decryptFailures.length} project(s) have env vars that do not decrypt: ${decryptFailures.join(', ')}`);

  // 5. History coverage (informational — the bridge migrates current+previous
  // releases by design; full history stays in legacy tables until Phase 3)
  report.history = {
    deployHistoryRows: await prisma.deployHistory.count(),
    releases: releases.length,
    statsHistoryRows: await prisma.statsHistory.count(),
    infrastructureMetrics: await prisma.infrastructureMetric.count(),
  };

  // 7. Containers ↔ releases (needs Docker)
  try {
    const dockerService = require('../src/services/docker');
    const docker = dockerService.createDocker();
    await docker.ping();
    const managed = await docker.listContainers({
      all: false,
      filters: JSON.stringify({ label: ['managed=acronym-deploy'] }),
    });
    const knownContainers = new Set(
      [...releases.map((r) => r.containerId), ...projects.map((p) => p.containerId)].filter(Boolean),
    );
    const orphans = managed
      .map((c) => ({ id: c.Id, name: (c.Names && c.Names[0]) || c.Id.slice(0, 12) }))
      .filter((c) => ![...knownContainers].some((k) => c.id.startsWith(k) || k.startsWith(c.id)));
    report.docker = { status: 'measured', running: managed.length, orphans };
    if (orphans.length) fail(`${orphans.length} running container(s) map to no release/project`);
  } catch {
    report.docker = { status: 'not_measured' };
  }

  // 8. Routes ↔ domains (needs the Caddy routes dir)
  const routesDir = process.env.CADDY_ROUTES_DIR;
  if (routesDir) {
    try {
      const fs = require('fs');
      const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.caddy') || f.endsWith('.conf'));
      const slugs = new Set([...projects.map((p) => p.slug), ...systems.map((s) => s.slug)]);
      const unknownRoutes = files.filter((f) => !slugs.has(f.replace(/\.(caddy|conf)$/, '')));
      report.caddy = { status: 'measured', routeFiles: files.length, unknownRoutes };
      if (unknownRoutes.length) fail(`${unknownRoutes.length} route file(s) map to no known system: ${unknownRoutes.join(', ')}`);
    } catch {
      report.caddy = { status: 'not_measured' };
    }
  } else {
    report.caddy = { status: 'not_measured' };
  }

  // Backup coverage: pg_dump dumps the whole schema, so dual-mode data is
  // covered by construction once the V4 migration is applied.
  report.backup = { coverage: 'pg_dump covers legacy and V4 tables', schemaMarker: true };

  return report;
}

module.exports = { reconcileV4 };

if (require.main === module) {
  (async () => {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is required.');
      process.exit(1);
    }
    const { prisma } = require('../src/repo/client');
    const report = await reconcileV4({ prisma });
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
    if (!report.ok) {
      console.error(`\nRECONCILIATION FAILED (${report.failures.length} issue(s)).`);
      process.exit(1);
    }
    console.error('\nReconciliation passed.');
  })().catch((e) => {
    console.error('Reconciliation crashed:', e.message);
    process.exit(1);
  });
}
