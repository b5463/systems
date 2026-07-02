'use strict';

// V4 Phase 2 — legacy compatibility adapter.
//
// When ENABLE_V4_SYSTEMS is on, the legacy projects API serves rows whose
// V4-owned core fields come from the V4 tables (systems / environments /
// releases via legacy_project_map). Fields the V4 model does not own yet
// (health, github deploy state, last_error, limits, blue/green ports…) still
// come from the legacy row, so the response contract is unchanged. Projects
// created after the bridge ran (not in the map) pass through untouched.
//
// This proves the V4 model can back the legacy surface; the legacy tables
// remain the operational source of truth until Phase 3.

const { prisma } = require('../repo/client');

// Overlay the V4-owned fields (roadmap Phase 2 mapping) onto a legacy
// snake_case project row.
function overlay(row, { system, environment, release }) {
  if (!system) return row;
  const out = { ...row };
  out.name = system.name;
  out.slug = system.slug;
  out.deploy_type = system.systemType;
  out.status = system.currentStatus;
  out.repo = system.repo;
  out.deploy_branch = system.deployBranch;
  out.is_primary = system.isPrimaryRoot;
  if (environment) {
    out.visibility = environment.accessPolicy;
    out.health_path = environment.healthPath;
    out.route_published = environment.routePublished;
    out.basic_user = environment.basicUser;
    out.basic_hash = environment.basicHash;
  }
  if (release) {
    out.container_id = release.containerId;
    out.image_id = release.imageId;
    out.port = release.port;
  }
  return out;
}

async function v4Context(projectIds) {
  // org-scope-exempt: single-tenant compat layer keyed by legacy project ids
  const maps = await prisma.legacyProjectMap.findMany({
    where: { projectId: { in: projectIds } },
  });
  if (!maps.length) return new Map();

  const [systems, environments, releases] = await Promise.all([
    prisma.system.findMany({ where: { id: { in: maps.map((m) => m.systemId) } } }), // org-scope-exempt: PKs from the map above
    prisma.systemEnvironment.findMany({ where: { id: { in: maps.map((m) => m.environmentId) } } }), // org-scope-exempt: PKs from the map above
    prisma.release.findMany({ where: { id: { in: maps.map((m) => m.releaseId).filter(Boolean) } } }), // org-scope-exempt: PKs from the map above
  ]);
  const sysById = new Map(systems.map((s) => [s.id, s]));
  const envById = new Map(environments.map((e) => [e.id, e]));
  const relById = new Map(releases.map((r) => [r.id, r]));

  return new Map(maps.map((m) => [m.projectId, {
    system: sysById.get(m.systemId) || null,
    environment: envById.get(m.environmentId) || null,
    release: m.releaseId ? relById.get(m.releaseId) || null : null,
  }]));
}

// rows: legacy snake_case project rows (repo/projects toSnake output).
async function overlayProjects(rows) {
  const list = rows.filter(Boolean);
  if (!list.length) return rows;
  const ctx = await v4Context(list.map((r) => r.id));
  return rows.map((row) => (row && ctx.has(row.id) ? overlay(row, ctx.get(row.id)) : row));
}

async function overlayProject(row) {
  if (!row) return row;
  const [result] = await overlayProjects([row]);
  return result;
}

module.exports = { overlayProjects, overlayProject };
