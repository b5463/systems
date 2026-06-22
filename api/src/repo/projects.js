'use strict';

const { prisma } = require('./client');

function toSnake(row) {
  if (!row) return null;
  const fmt = (d) => d instanceof Date ? d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') : d;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    container_id: row.containerId,
    image_id: row.imageId,
    port: row.port,
    status: row.status,
    env_vars: row.envVars,
    created_at: fmt(row.createdAt),
    updated_at: fmt(row.updatedAt),
    previous_image_id: row.previousImageId,
    previous_container_id: row.previousContainerId,
    visibility: row.visibility,
    deploy_type: row.deployType,
    basic_user: row.basicUser,
    basic_hash: row.basicHash,
    health_state: row.healthState,
    health_status: row.healthStatus,
    health_response_ms: row.healthResponseMs,
    health_checked_at: row.healthCheckedAt,
    health_failures: row.healthFailures,
    health_path: row.healthPath,
    route_published: row.routePublished ? 1 : 0,
    attestation_state: row.attestationState,
    attestation_checked_at: row.attestationCheckedAt,
    last_error: row.lastError,
    last_error_stage: row.lastErrorStage,
    last_error_hint: row.lastErrorHint,
    last_error_excerpt: row.lastErrorExcerpt,
    repo: row.repo,
    deploy_branch: row.deployBranch,
    is_primary: row.isPrimary ? 1 : 0,
    limit_memory_mb: row.limitMemoryMb,
    limit_cpu: row.limitCpu,
    limit_pids: row.limitPids,
    limit_restart_policy: row.limitRestartPolicy,
    limit_log_max_size: row.limitLogMaxSize,
    limit_log_max_file: row.limitLogMaxFile,
    github_deploy_status: row.githubDeployStatus,
    github_deploy_detail: row.githubDeployDetail,
    github_deploy_at: row.githubDeployAt,
  };
}

async function findBySlug(slug) {
  const row = await prisma.project.findUnique({ where: { slug } });
  return toSnake(row);
}

async function findById(id) {
  const row = await prisma.project.findUnique({ where: { id } });
  return toSnake(row);
}

async function findBySlugOrName(slug, name) {
  const row = await prisma.project.findFirst({
    where: { OR: [{ slug }, { name }] },
  });
  return toSnake(row);
}

async function findBySlugNotDeleted(slug) {
  const row = await prisma.project.findFirst({
    where: { slug, NOT: { status: 'deleted' } },
  });
  return toSnake(row);
}

async function listAll() {
  const rows = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toSnake);
}

async function listNonDeleted() {
  const rows = await prisma.project.findMany({
    where: { NOT: { status: 'deleted' } },
  });
  return rows.map(toSnake);
}

async function getAllPorts() {
  const rows = await prisma.project.findMany({
    where: { port: { not: null } },
    select: { port: true },
  });
  return rows;
}

async function allocateAndCreate({ name, slug, visibility }, findFreePortFn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1)`;
    const existing = await tx.project.findFirst({
      where: { OR: [{ slug }, { name }] },
    });
    if (existing) return { conflict: true };
    const dbPorts = await tx.project.findMany({
      where: { port: { not: null } },
      select: { port: true },
    });
    const usedPorts = new Set(dbPorts.map((r) => r.port));
    const port = await findFreePortFn(4000, 5000, usedPorts);
    const row = await tx.project.create({
      data: { name, slug, port, status: 'building', visibility },
    });
    return { conflict: false, project: toSnake(row), port };
  });
}

async function create({ name, slug, port, visibility }) {
  const row = await prisma.project.create({
    data: { name, slug, port, status: 'building', visibility },
  });
  return toSnake(row);
}

async function updateStatus(slug, status) {
  await prisma.project.update({
    where: { slug },
    data: { status, updatedAt: new Date() },
  });
}

async function updateAfterBuild(slug, { containerId, imageId, deployType }) {
  await prisma.project.update({
    where: { slug },
    data: {
      status: 'running',
      containerId,
      imageId,
      deployType,
      lastError: null,
      lastErrorStage: null,
      lastErrorHint: null,
      lastErrorExcerpt: null,
      updatedAt: new Date(),
    },
  });
}

async function updateAfterRedeploy(slug, { containerId, imageId }) {
  await prisma.project.update({
    where: { slug },
    data: {
      status: 'running',
      containerId,
      imageId,
      lastError: null,
      lastErrorStage: null,
      lastErrorHint: null,
      lastErrorExcerpt: null,
      updatedAt: new Date(),
    },
  });
}

async function updateHealth(slug, { healthState, healthStatus, healthResponseMs, healthCheckedAt, attestationState, attestationCheckedAt }) {
  await prisma.project.update({
    where: { slug },
    data: { healthState, healthStatus, healthResponseMs, healthCheckedAt, attestationState, attestationCheckedAt },
  });
}

async function updateHealthFailures(slug, state) {
  if (state === 'healthy') {
    await prisma.project.update({ where: { slug }, data: { healthFailures: 0 } });
  } else {
    await prisma.project.update({ where: { slug }, data: { healthFailures: { increment: 1 } } });
  }
}

async function updateRoutePublished(slug, published) {
  await prisma.project.update({
    where: { slug },
    data: { routePublished: !!published, updatedAt: new Date() },
  });
}

async function updateEnvVars(slug, encrypted) {
  await prisma.project.update({
    where: { slug },
    data: { envVars: encrypted, updatedAt: new Date() },
  });
}

async function updateEnvAndBuilding(slug, encrypted) {
  await prisma.project.update({
    where: { slug },
    data: { envVars: encrypted, status: 'building', updatedAt: new Date() },
  });
}

async function updateContainerRunning(slug, containerId) {
  await prisma.project.update({
    where: { slug },
    data: { status: 'running', containerId, updatedAt: new Date() },
  });
}

async function updateContainerError(slug) {
  await prisma.project.update({
    where: { slug },
    data: { status: 'error', containerId: null, updatedAt: new Date() },
  });
}

async function updateError(slug, { lastError, lastErrorStage, lastErrorHint, lastErrorExcerpt }) {
  await prisma.project.update({
    where: { slug },
    data: { status: 'error', lastError, lastErrorStage, lastErrorHint, lastErrorExcerpt, updatedAt: new Date() },
  });
}

async function updateGithubDeployFailed(slug, reason) {
  await prisma.project.updateMany({
    where: { slug, githubDeployStatus: 'building' },
    data: { githubDeployStatus: 'failed', githubDeployDetail: reason, githubDeployAt: new Date().toISOString() },
  });
}

async function updateGithubDeploySucceeded(slug) {
  await prisma.project.updateMany({
    where: { slug, githubDeployStatus: 'building' },
    data: { githubDeployStatus: 'succeeded', githubDeployDetail: 'Deployment completed', githubDeployAt: new Date().toISOString() },
  });
}

async function updateGithubDeployStatus(slug, status, detail) {
  await prisma.project.update({
    where: { slug },
    data: { githubDeployStatus: status, githubDeployDetail: detail, githubDeployAt: new Date().toISOString() },
  });
}

async function setPreviousSnap(slug, containerId, imageId) {
  await prisma.project.update({
    where: { slug },
    data: { previousContainerId: containerId, previousImageId: imageId },
  });
}

async function updateVisibility(slug, { visibility, basicUser, basicHash, routePublished, isPrimary }) {
  await prisma.project.update({
    where: { slug },
    data: { visibility, basicUser, basicHash, routePublished: !!routePublished, isPrimary: !!isPrimary, updatedAt: new Date() },
  });
}

async function updateLimits(slug, { memoryMb, cpuLimit, pidsLimit, restartPolicy, logMaxSize, logMaxFile, healthPath }) {
  await prisma.project.update({
    where: { slug },
    data: {
      limitMemoryMb: memoryMb, limitCpu: cpuLimit, limitPids: pidsLimit,
      limitRestartPolicy: restartPolicy, limitLogMaxSize: logMaxSize, limitLogMaxFile: logMaxFile,
      healthPath, updatedAt: new Date(),
    },
  });
}

async function softDelete(slug) {
  await prisma.project.update({
    where: { slug },
    data: { status: 'deleted', containerId: null, routePublished: false, updatedAt: new Date() },
  });
}

async function hardDelete(slug) {
  await prisma.project.delete({ where: { slug } });
}

async function updateRollback(slug, { containerId, imageId, previousContainerId, previousImageId }) {
  await prisma.project.update({
    where: { slug },
    data: {
      status: 'running', containerId, imageId,
      previousContainerId, previousImageId,
      updatedAt: new Date(),
    },
  });
}

async function findCurrentPrimary(excludeSlug) {
  const row = await prisma.project.findFirst({
    where: { isPrimary: true, NOT: { slug: excludeSlug } },
  });
  return toSnake(row);
}

async function clearPrimary(id) {
  await prisma.project.update({
    where: { id },
    data: { isPrimary: false, updatedAt: new Date() },
  });
}

async function setPrimary(slug) {
  await prisma.project.update({
    where: { slug },
    data: { isPrimary: true, updatedAt: new Date() },
  });
}

async function clearPrimaryBySlug(slug) {
  await prisma.project.update({
    where: { slug },
    data: { isPrimary: false, updatedAt: new Date() },
  });
}

async function updateRepo(slug, repo, branch) {
  await prisma.project.update({
    where: { slug },
    data: { repo, deployBranch: branch, updatedAt: new Date() },
  });
}

async function findByRepo(repo) {
  const row = await prisma.project.findFirst({
    where: { repo, NOT: { status: 'deleted' } },
  });
  return toSnake(row);
}

async function slugTaken(slug) {
  const row = await prisma.project.findFirst({
    where: { slug, NOT: { status: 'deleted' } },
  });
  return !!row;
}

async function getProjectId(slug) {
  const row = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
  return row;
}

async function findRunningWithPort() {
  const rows = await prisma.project.findMany({
    where: { status: 'running', port: { not: null } },
  });
  return rows.map(toSnake);
}

async function findBuildingOlderThan(ms) {
  const rows = await prisma.$queryRaw`
    SELECT slug, status FROM projects
    WHERE status = 'building'
      AND EXTRACT(EPOCH FROM (NOW() - "updated_at")) * 1000 > ${ms}`;
  return rows;
}

async function getAllImageIds() {
  const rows = await prisma.project.findMany({
    select: { imageId: true, previousImageId: true },
  });
  return rows.map((r) => ({ image_id: r.imageId, previous_image_id: r.previousImageId }));
}

async function getAllSlugs() {
  const rows = await prisma.project.findMany({ select: { slug: true } });
  return rows.map((r) => r.slug);
}

async function getSystemsSnapshot() {
  const rows = await prisma.$queryRaw`
    SELECT p.slug, p.health_failures,
      s.cpu_percent,
      CASE WHEN s.memory_limit_mb > 0 THEN (s.memory_mb / s.memory_limit_mb) * 100 ELSE NULL END AS memory_percent
    FROM projects p
    LEFT JOIN stats_history s ON s.id = (
      SELECT id FROM stats_history WHERE project_id = p.id ORDER BY recorded_at DESC, id DESC LIMIT 1
    )
    WHERE p.status = 'running'`;
  return rows.map((row) => ({
    slug: row.slug,
    healthFailures: Number(row.health_failures) || 0,
    cpuPercent: row.cpu_percent != null ? Number(row.cpu_percent) : null,
    memoryPercent: row.memory_percent != null ? Number(row.memory_percent) : null,
  }));
}

// Deploy history

async function createDeployHistory(projectId, imageId, containerId) {
  await prisma.deployHistory.create({
    data: { projectId, imageId, containerId },
  });
}

async function getDeployHistory(projectId, limit = 10) {
  const rows = await prisma.deployHistory.findMany({
    where: { projectId },
    orderBy: [{ deployedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    image_id: r.imageId,
    container_id: r.containerId,
    deployed_at: r.deployedAt instanceof Date ? r.deployedAt.toISOString() : r.deployedAt,
  }));
}

async function pruneDeployHistory(projectId, retentionCount) {
  const keep = await prisma.deployHistory.findMany({
    where: { projectId },
    orderBy: [{ deployedAt: 'desc' }, { id: 'desc' }],
    take: retentionCount,
    select: { id: true },
  });
  const keepIds = keep.map((r) => r.id);
  if (keepIds.length) {
    await prisma.deployHistory.deleteMany({
      where: { projectId, id: { notIn: keepIds } },
    });
  }
}

module.exports = {
  findBySlug, findById, findBySlugOrName, findBySlugNotDeleted,
  listAll, listNonDeleted, getAllPorts,
  allocateAndCreate, create,
  updateStatus, updateAfterBuild, updateAfterRedeploy,
  updateHealth, updateHealthFailures, updateRoutePublished,
  updateEnvVars, updateEnvAndBuilding, updateContainerRunning, updateContainerError,
  updateError, updateGithubDeployFailed, updateGithubDeploySucceeded, updateGithubDeployStatus,
  setPreviousSnap, updateVisibility, updateLimits,
  softDelete, hardDelete, updateRollback,
  findCurrentPrimary, clearPrimary, setPrimary, clearPrimaryBySlug,
  updateRepo, findByRepo, slugTaken, getProjectId,
  findRunningWithPort, findBuildingOlderThan,
  getAllImageIds, getAllSlugs, getSystemsSnapshot,
  createDeployHistory, getDeployHistory, pruneDeployHistory,
};
