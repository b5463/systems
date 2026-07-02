'use strict';

// V4 Phase 3 — best-effort sync from the legacy deploy pipeline into the V4
// model. The legacy `projects` world remains the operational source of truth;
// these hooks keep the V4 copy fresh (which also keeps the Phase 2.5
// reconciliation green) and stamp V4 labels onto containers.
//
// EVERY function here is fail-open: a V4 sync problem must never break a
// legacy deploy. Unmapped projects (bridge not run, or V4 disabled) are a
// silent no-op.

const { prisma } = require('../repo/client');

async function mapForSlug(slug) {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return null;
  // org-scope-exempt: single-tenant compat keyed by unique legacy project id
  const map = await prisma.legacyProjectMap.findUnique({ where: { projectId: project.id } });
  return map ? { project, map } : null;
}

// V4 Docker labels (roadmap Phase 3). Returned flat, ready to merge into the
// container's Labels; {} when the project is not V4-mapped.
async function labelsForSlug(slug) {
  try {
    const hit = await mapForSlug(slug);
    if (!hit) return {};
    return {
      'systems.organisation_id': hit.map.organisationId,
      'systems.system_id': hit.map.systemId,
      'systems.environment_id': hit.map.environmentId,
      'systems.slug': slug,
      'systems.environment': hit.project.isPreview ? 'preview' : 'production',
    };
  } catch {
    return {};
  }
}

// After a successful deploy/redeploy/rollback: record the project's current
// container/image/port as the environment's current V4 release, supersede the
// old one, and refresh the system status. Idempotent — if the current release
// already matches, nothing is written.
async function syncReleaseForProject(slug) {
  try {
    const hit = await mapForSlug(slug);
    if (!hit) return null;
    const { project, map } = hit;

    return await prisma.$transaction(async (tx) => {
      // org-scope-exempt: PK from the org-scoped map row
      const environment = await tx.systemEnvironment.findUnique({ where: { id: map.environmentId } });
      if (!environment) return null;

      const current = environment.currentReleaseId
        // org-scope-exempt: PK pointer from the environment row
        ? await tx.release.findUnique({ where: { id: environment.currentReleaseId } })
        : null;

      let release = current;
      const unchanged = current
        && current.containerId === project.containerId
        && current.imageId === project.imageId
        && current.port === project.port;

      if (!unchanged) {
        if (current) {
          // org-scope-exempt: supersede by PK fetched above
          await tx.release.update({ where: { id: current.id }, data: { status: 'superseded' } });
        }
        release = await tx.release.create({
          data: {
            organisationId: map.organisationId,
            systemId: map.systemId,
            environmentId: map.environmentId,
            containerId: project.containerId,
            imageId: project.imageId,
            port: project.port,
            status: 'active',
            metadata: JSON.stringify({ source: 'pipeline_sync', activeSlot: project.activeSlot || 'blue' }),
          },
        });
        // org-scope-exempt: PK from the org-scoped map row
        await tx.systemEnvironment.update({
          where: { id: map.environmentId },
          data: { currentReleaseId: release.id, routePublished: !!project.routePublished },
        });
        // org-scope-exempt: PK of the map row itself
        await tx.legacyProjectMap.update({
          where: { id: map.id },
          data: { releaseId: release.id },
        });
      }

      // org-scope-exempt: PK from the org-scoped map row
      await tx.system.update({
        where: { id: map.systemId },
        data: { currentStatus: project.status },
      });
      return release;
    });
  } catch (e) {
    console.error(`[v4sync] release sync failed for ${slug} (legacy deploy unaffected):`, e.message);
    return null;
  }
}

// Lightweight status-only refresh (build started/failed etc.).
async function syncStatus(slug) {
  try {
    const hit = await mapForSlug(slug);
    if (!hit) return;
    // org-scope-exempt: PK from the org-scoped map row
    await prisma.system.update({
      where: { id: hit.map.systemId },
      data: { currentStatus: hit.project.status },
    });
  } catch { /* fail-open */ }
}

module.exports = { labelsForSlug, syncReleaseForProject, syncStatus, mapForSlug };
