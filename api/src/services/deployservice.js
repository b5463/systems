'use strict';

// V4 Phase 3 — deploy engine on Systems/Environments.
//
// The V4 deploy surface targets a system_environment; execution flows through
// the mapping layer into the proven legacy pipeline (beginDeploy/beginRedeploy
// /rollbackProject), which keeps ONE pipeline in production while both API
// generations stay live. v4sync mirrors results into V4 releases.
//
// Dependencies are injectable (setDeps) so orchestration is unit-testable
// without Docker; production uses the real modules.

const { prisma } = require('../repo/client');
const systemRepo = require('../repo/systems');
const auditV4Repo = require('../repo/auditv4');

let deps = null;
function realDeps() {
  const deploy = require('../routes/deploy');
  const projects = require('../routes/projects');
  return {
    beginDeploy: deploy.beginDeploy,
    beginRedeploy: deploy.beginRedeploy,
    rollbackProject: projects.rollbackProject,
    health: require('./health'),
    proxy: require('./proxy'),
    docker: require('./docker'),
  };
}
function getDeps() { return deps || (deps = realDeps()); }
// test hook — pass null to restore the real modules
function setDeps(overrides) { deps = overrides ? { ...realDeps(), ...overrides } : null; }

// Resolve a system + environment (+ mapped legacy project, when one exists)
// within the caller's organisation. Environment name comes from the URL.
async function resolveTarget(organisationId, systemId, envName) {
  const system = await systemRepo.findById(organisationId, systemId).catch(() => null);
  if (!system) return { error: { code: 404, message: 'System not found' } };
  const environment = system.environments.find((e) => e.name === envName);
  if (!environment) return { error: { code: 404, message: `No ${envName} environment for this system` } };

  // org-scope-exempt: unique key includes the environment id resolved above
  const map = await prisma.legacyProjectMap.findFirst({
    where: { systemId: system.id, environmentId: environment.id, organisationId },
  });
  const project = map
    // org-scope-exempt: PK from the org-scoped map row
    ? await prisma.project.findUnique({ where: { id: map.projectId } })
    : null;
  return { system, environment, map, project };
}

// Deploy a zip to an environment. Mapped systems redeploy their legacy
// project; V4-native systems get a legacy project created (the pipeline's
// operational home until the cutover) and are mapped on the spot.
async function deployToEnvironment({ organisationId, systemId, envName, zipPath, userId, ip }) {
  const target = await resolveTarget(organisationId, systemId, envName);
  if (target.error) return { ok: false, code: target.error.code, error: target.error.message };
  const { system, environment, project } = target;
  const d = getDeps();

  let result;
  if (project) {
    result = await d.beginRedeploy({ slug: project.slug, zipPath, userId, ip });
  } else {
    // Legacy projects are slug-unique, and preview runs as its own project in
    // the legacy world — suffix so a preview deploy can never collide with
    // the production project of the same system.
    const projectSlug = envName === 'preview' ? `${system.slug}-preview` : system.slug;
    result = await d.beginDeploy({
      name: envName === 'preview' ? `${system.name} (preview)` : system.name,
      slug: projectSlug,
      visibility: environment.accessPolicy === 'private' ? 'private' : 'public',
      zipPath, userId, ip,
    });
    if (result.ok) {
      // org-scope-exempt: creation carries organisationId in its data payload
      const created = await prisma.project.findUnique({ where: { slug: projectSlug } });
      await prisma.legacyProjectMap.create({
        data: {
          organisationId,
          projectId: created.id,
          systemId: system.id,
          environmentId: environment.id,
        },
      });
      // First deploy of a production environment also gets its default
      // subdomain record (mirrors the Phase 2 bridge behaviour).
      if (envName === 'production') {
        const hostname = `${system.slug}.${process.env.BASE_DOMAIN || 'acronym.sk'}`;
        await prisma.domain.upsert({
          where: { hostname },
          update: { systemId: system.id, environmentId: environment.id },
          create: {
            organisationId, hostname, systemId: system.id,
            environmentId: environment.id, isCustom: false, verified: true,
          },
        });
      }
    }
  }

  if (result.ok) {
    await auditV4Repo.append({
      organisation_id: organisationId, admin_user_id: null, action: 'environment_deploy',
      entity_type: 'system_environment', entity_id: environment.id,
      detail: `${system.slug}/${envName}`, ip,
    });
  }
  return { ...result, system: { id: system.id, slug: system.slug }, environment: environment.name };
}

async function rollbackEnvironment({ organisationId, systemId, envName, userId, ip, log }) {
  const target = await resolveTarget(organisationId, systemId, envName);
  if (target.error) return { ok: false, code: target.error.code, error: target.error.message };
  if (!target.project) return { ok: false, code: 409, error: 'Environment has no deployments yet' };

  const result = await getDeps().rollbackProject({ slug: target.project.slug, userId, ip, log });
  if (result.ok) {
    await auditV4Repo.append({
      organisation_id: organisationId, action: 'environment_rollback',
      entity_type: 'system_environment', entity_id: target.environment.id,
      detail: `${target.system.slug}/${envName}`, ip,
    });
  }
  return result;
}

// Promote the preview environment's current release to production (roadmap
// flow): preview release exists → health gate passes → production release
// recorded (previous superseded — a no-op on the first-ever promotion) →
// route publication delegated to the production environment's project.
async function promote({ organisationId, systemId, userId, ip }) {
  const preview = await resolveTarget(organisationId, systemId, 'preview');
  if (preview.error) return { ok: false, code: preview.error.code, error: preview.error.message };
  const production = await resolveTarget(organisationId, systemId, 'production');
  if (production.error) return { ok: false, code: production.error.code, error: production.error.message };

  const previewRelease = preview.environment.currentReleaseId
    // org-scope-exempt: PK pointer from the org-scoped environment row
    ? await prisma.release.findUnique({ where: { id: preview.environment.currentReleaseId } })
    : null;
  if (!previewRelease) return { ok: false, code: 400, error: 'No preview release to promote' };
  if (!previewRelease.port) return { ok: false, code: 409, error: 'Preview release has no running port' };

  const d = getDeps();

  // Health gate — never promote an unhealthy release.
  const healthPath = preview.environment.healthPath || '/';
  try {
    await d.health.waitForHealthy(d.health.targetForPort(previewRelease.port), healthPath);
  } catch (err) {
    return { ok: false, code: 502, error: `Promotion blocked: preview failed its health gate (${err.message})` };
  }

  const release = await prisma.$transaction(async (tx) => {
    const current = production.environment.currentReleaseId
      // org-scope-exempt: PK pointer from the org-scoped environment row
      ? await tx.release.findUnique({ where: { id: production.environment.currentReleaseId } })
      : null;
    if (current) {
      // Retain previous: mark superseded, keep the row for rollback. On the
      // first-ever promotion there is no previous release — skip, don't fail.
      // org-scope-exempt: supersede by PK fetched above
      await tx.release.update({ where: { id: current.id }, data: { status: 'superseded' } });
    }
    const created = await tx.release.create({
      data: {
        organisationId,
        systemId: production.system.id,
        environmentId: production.environment.id,
        containerId: previewRelease.containerId,
        imageId: previewRelease.imageId,
        port: previewRelease.port,
        status: 'active',
        metadata: JSON.stringify({ source: 'promote', fromRelease: previewRelease.id }),
      },
    });
    // org-scope-exempt: PK from the org-scoped environment row
    await tx.systemEnvironment.update({
      where: { id: production.environment.id },
      data: { currentReleaseId: created.id },
    });
    return created;
  });

  // Route switch — via the production project when mapped; recorded either way.
  if (production.project) {
    try {
      await d.proxy.publishRoute({
        slug: production.project.slug,
        port: previewRelease.port,
        visibility: production.environment.accessPolicy === 'private' ? 'private' : 'public',
        basicUser: production.environment.basicUser,
        basicHash: production.environment.basicHash,
        apex: !!production.system.isPrimaryRoot,
      });
    } catch (err) {
      return { ok: true, release, warning: `Release recorded but route switch failed: ${err.message}` };
    }
  }

  await auditV4Repo.append({
    organisation_id: organisationId, action: 'environment_promote',
    entity_type: 'system', entity_id: production.system.id,
    detail: `release:${release.id}`, ip,
  });
  return { ok: true, release };
}

module.exports = { resolveTarget, deployToEnvironment, rollbackEnvironment, promote, setDeps };
