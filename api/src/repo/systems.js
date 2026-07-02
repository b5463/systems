'use strict';

const { prisma } = require('./client');

// V4 Phase 2 systems. ORG-SCOPING RULE: every method takes organisationId as
// its first argument and filters on it — no exceptions. Cross-org reads must
// be impossible at this layer regardless of what the route passes in.

const ENV_INCLUDE = {
  environments: {
    orderBy: { createdAt: 'asc' },
  },
};

// Attach each environment's current release without an FK relation (the
// pointer column avoids a cycle; see schema).
async function withCurrentReleases(system) {
  if (!system) return system;
  const releaseIds = system.environments
    .map((e) => e.currentReleaseId)
    .filter(Boolean);
  const releases = releaseIds.length
    // org-scope-exempt: ids come from environments of an already org-scoped system
    ? await prisma.release.findMany({ where: { id: { in: releaseIds } } })
    : [];
  const byId = new Map(releases.map((r) => [r.id, r]));
  return {
    ...system,
    environments: system.environments.map((e) => ({
      ...e,
      currentRelease: e.currentReleaseId ? byId.get(e.currentReleaseId) || null : null,
    })),
  };
}

async function list(organisationId) {
  const systems = await prisma.system.findMany({
    where: { organisationId },
    include: ENV_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(systems.map(withCurrentReleases));
}

async function findById(organisationId, id) {
  const system = await prisma.system.findFirst({
    where: { id, organisationId },
    include: ENV_INCLUDE,
  });
  return withCurrentReleases(system);
}

async function findBySlug(organisationId, slug) {
  const system = await prisma.system.findUnique({
    where: { organisationId_slug: { organisationId, slug } },
    include: ENV_INCLUDE,
  });
  return withCurrentReleases(system);
}

// Creating a system always creates its production environment (roadmap: one
// project becomes one system with a production environment).
async function create(organisationId, {
  name, slug, productId = null, systemType = null, repo = null,
  deployBranch = 'main', isPrimaryRoot = false, runtime = null,
  environment = {},
}) {
  return prisma.system.create({
    data: {
      organisationId, name, slug, productId, systemType, repo,
      deployBranch, isPrimaryRoot, runtime,
      environments: {
        create: [{
          organisationId,
          name: 'production',
          accessPolicy: environment.accessPolicy || 'public',
          healthPath: environment.healthPath || '/',
        }],
      },
    },
    include: ENV_INCLUDE,
  });
}

async function update(organisationId, id, patch) {
  const allowed = {};
  for (const key of ['name', 'productId', 'systemType', 'currentStatus', 'repo', 'deployBranch', 'isPrimaryRoot', 'runtime']) {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  }
  const { count } = await prisma.system.updateMany({
    where: { id, organisationId },
    data: allowed,
  });
  return count ? findById(organisationId, id) : null;
}

async function listEnvironments(organisationId, systemId) {
  return prisma.systemEnvironment.findMany({
    where: { systemId, organisationId },
    orderBy: { createdAt: 'asc' },
  });
}

async function listReleases(organisationId, systemId, { limit = 50 } = {}) {
  return prisma.release.findMany({
    where: { systemId, organisationId },
    orderBy: { deployedAt: 'desc' },
    take: Math.min(limit, 200),
  });
}

module.exports = {
  list, findById, findBySlug, create, update, listEnvironments, listReleases,
};
