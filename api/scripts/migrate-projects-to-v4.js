#!/usr/bin/env node
'use strict';

// V4 Phase 2 — migration bridge: projects → systems.
//
// Copies every legacy project into the V4 model following the roadmap bridge:
//
//   projects → legacy_project_map → systems → production environment
//            → current release (+ previous release when rollback data exists)
//            → default domain ({slug}.BASE_DOMAIN)
//
// Non-destructive and idempotent: legacy tables are never written, projects
// already present in legacy_project_map are skipped, and re-runs are safe.
// The legacy `projects` table remains the operational source of truth until
// Phase 3 moves the deploy engine.
//
// Field mapping (roadmap §Phase 2):
//   name, slug, deploy_type→system_type, status→current_status, repo,
//   deploy_branch, is_primary→is_primary_root, runtime      → systems
//   visibility→access_policy, health_path, route_published,
//   basic_user, basic_hash                                  → system_environments
//   container_id, image_id, port                            → current release
//   previous_container_id, previous_image_id                → previous release
//
// Usage: DATABASE_URL=... node scripts/migrate-projects-to-v4.js

const BASE_DOMAIN = () => process.env.BASE_DOMAIN || 'acronym.sk';

async function migrateProjects({ prisma, organisationId, log = () => {} }) {
  const projects = await prisma.project.findMany({ orderBy: { id: 'asc' } });
  const mapped = await prisma.legacyProjectMap.findMany({ select: { projectId: true } });
  const alreadyMapped = new Set(mapped.map((m) => m.projectId));

  const result = { migrated: 0, skipped: 0, total: projects.length };

  for (const p of projects) {
    if (alreadyMapped.has(p.id)) {
      result.skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const system = await tx.system.create({
        data: {
          organisationId,
          name: p.name,
          slug: p.slug,
          systemType: p.deployType,
          currentStatus: p.status,
          repo: p.repo,
          deployBranch: p.deployBranch || 'main',
          isPrimaryRoot: !!p.isPrimary,
          runtime: p.runtime,
        },
      });

      const environment = await tx.systemEnvironment.create({
        data: {
          organisationId,
          systemId: system.id,
          name: p.isPreview ? 'preview' : 'production',
          accessPolicy: p.visibility || 'public',
          healthPath: p.healthPath || '/',
          routePublished: !!p.routePublished,
          basicUser: p.basicUser,
          basicHash: p.basicHash,
        },
      });

      // Previous release first (if rollback data exists), then the current
      // one, so deployed_at ordering matches reality.
      if (p.previousImageId || p.previousContainerId) {
        await tx.release.create({
          data: {
            organisationId,
            systemId: system.id,
            environmentId: environment.id,
            containerId: p.previousContainerId,
            imageId: p.previousImageId,
            status: 'superseded',
            deployedAt: new Date(p.createdAt),
            metadata: JSON.stringify({ source: 'legacy_previous' }),
          },
        });
      }

      let release = null;
      if (p.containerId || p.imageId || p.port) {
        release = await tx.release.create({
          data: {
            organisationId,
            systemId: system.id,
            environmentId: environment.id,
            containerId: p.containerId,
            imageId: p.imageId,
            port: p.port,
            status: 'active',
            deployedAt: new Date(p.updatedAt),
            metadata: JSON.stringify({ source: 'legacy_current', activeSlot: p.activeSlot || 'blue' }),
          },
        });
        await tx.systemEnvironment.update({
          where: { id: environment.id },
          data: { currentReleaseId: release.id },
        });
      }

      const domain = await tx.domain.create({
        data: {
          organisationId,
          hostname: `${p.slug}.${BASE_DOMAIN()}`,
          systemId: system.id,
          environmentId: environment.id,
          isCustom: false,
          verified: true, // platform-owned default subdomain
        },
      });

      await tx.legacyProjectMap.create({
        data: {
          organisationId,
          projectId: p.id,
          systemId: system.id,
          environmentId: environment.id,
          releaseId: release ? release.id : null,
          domainId: domain.id,
        },
      });
    });

    result.migrated += 1;
    log(`migrated project #${p.id} (${p.slug})`);
  }

  return result;
}

module.exports = { migrateProjects };

if (require.main === module) {
  (async () => {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is required.');
      process.exit(1);
    }
    const { prisma } = require('../src/repo/client');
    const orgRepo = require('../src/repo/organisations');
    const org = await orgRepo.ensureDefault();
    const result = await migrateProjects({ prisma, organisationId: org.id, log: console.log });
    console.log(`Done: ${result.migrated} migrated, ${result.skipped} already mapped, ${result.total} total.`);
    await prisma.$disconnect();
  })().catch((e) => {
    console.error('Migration bridge failed:', e.message);
    process.exit(1);
  });
}
