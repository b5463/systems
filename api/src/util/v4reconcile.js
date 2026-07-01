'use strict';

// V4 migration reconciliation — shared logic used by both the standalone
// reconcile script and the /api/server/v4-migration-report endpoint.
// Reads existing V3 project data and reports readiness for Phase 2 migration.

const fs = require('fs');
const path = require('path');

function caddySystemsDir() {
  const dataDir = process.env.SYSTEMS_DATA_DIR || process.env.DATA_DIR || '/data';
  return process.env.CADDY_SYSTEMS_DIR || path.join(dataDir, 'caddy', 'systems');
}

async function runReconcile(prisma) {
  const generatedAt = new Date().toISOString();

  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } });

  const mapped = [];
  const unmapped = [];
  const warnings = [];
  const errors = [];

  for (const p of projects) {
    const issues = [];

    if (!p.slug) issues.push('missing slug');
    if (!p.deployType) issues.push('deploy_type not set (will default to container)');
    if (p.status === 'running' && !p.containerId) issues.push('status=running but no container_id');

    const historyCount = await prisma.deployHistory.count({ where: { projectId: p.id } });
    if (historyCount === 0) issues.push('no deploy history (never deployed)');

    const entry = {
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      deployType: p.deployType || null,
      containerId: p.containerId || null,
      routePublished: p.routePublished,
      hasEnvVars: !!p.envVars,
      deployHistoryCount: historyCount,
      issues,
    };

    const isBroken = issues.some((i) => i.startsWith('missing') || i.includes('no container_id'));
    if (isBroken) {
      errors.push(`[${p.slug || '?'}] ${issues.join('; ')}`);
      unmapped.push(entry);
    } else {
      if (issues.length > 0) warnings.push(`[${p.slug}] ${issues.join('; ')}`);
      mapped.push(entry);
    }
  }

  // Route file verification
  const systemsDir = caddySystemsDir();
  const routeStats = { active: 0, missing: 0, orphan: 0 };
  const allSlugs = new Set(projects.map((p) => p.slug));
  const publishedSlugs = new Set(projects.filter((p) => p.routePublished).map((p) => p.slug));

  try {
    const caddyFiles = fs.readdirSync(systemsDir).filter((f) => f.endsWith('.caddy'));
    for (const f of caddyFiles) {
      const slug = f.replace('.caddy', '');
      if (!allSlugs.has(slug)) {
        routeStats.orphan++;
        warnings.push(`Orphan caddy file: ${f} (no matching project)`);
      } else {
        routeStats.active++;
      }
    }
  } catch {
    warnings.push(`Cannot read caddy systems dir (${systemsDir}) — route check skipped`);
  }

  for (const slug of publishedSlugs) {
    const caddyPath = path.join(systemsDir, `${slug}.caddy`);
    if (!fs.existsSync(caddyPath)) {
      routeStats.missing++;
      warnings.push(`Missing caddy file for published project: ${slug}`);
    }
  }

  // Encrypted var format check
  let encryptedVarProjects = 0;
  let encryptionWarnings = 0;
  for (const p of projects) {
    if (p.envVars) {
      encryptedVarProjects++;
      if (typeof p.envVars !== 'string' || p.envVars.trim().length === 0) {
        encryptionWarnings++;
        warnings.push(`[${p.slug}] env_vars field present but appears malformed`);
      }
    }
  }

  // Backup coverage
  const lastBackup = await prisma.backupRecord.findFirst({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });

  const backupAgeHours = lastBackup
    ? Math.round(((Date.now() - new Date(lastBackup.createdAt).getTime()) / 3_600_000) * 10) / 10
    : null;

  const backupStatus = !lastBackup ? 'no_backup' : backupAgeHours > 48 ? 'stale' : 'ok';

  if (backupStatus !== 'ok') {
    warnings.push(
      `Backup ${backupStatus}: last backup was ${backupAgeHours != null ? `${backupAgeHours}h ago` : 'never'}`,
    );
  }

  return {
    generatedAt,
    version: 'v3-preflight',
    summary: {
      totalProjects: projects.length,
      mapped: mapped.length,
      unmapped: unmapped.length,
      warnings: warnings.length,
      errors: errors.length,
      routesActive: routeStats.active,
      routesMissing: routeStats.missing,
      routesOrphan: routeStats.orphan,
      encryptedVarProjects,
      encryptionWarnings,
      backupStatus,
      lastBackupAt: lastBackup ? lastBackup.createdAt : null,
      backupAgeHours,
    },
    projects: { mapped, unmapped },
    routes: routeStats,
    warnings,
    errors,
  };
}

module.exports = { runReconcile };
