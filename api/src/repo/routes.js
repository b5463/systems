'use strict';

// V4 Phase 4 — system_environment_routes junction + route_publication_attempts.
// ORG-SCOPING RULE: every method takes organisationId first and filters on it.

const { prisma } = require('./client');

// Upsert the (environment, domain) route row and set its status. Returns the row.
async function upsertRoute(organisationId, { systemId, environmentId, domainId, routeStatus, lastError }) {
  return prisma.systemEnvironmentRoute.upsert({
    where: { environmentId_domainId: { environmentId, domainId } },
    create: { organisationId, systemId, environmentId, domainId, routeStatus: routeStatus || 'inactive', lastError: lastError || null },
    update: { routeStatus, lastError: lastError || null },
  });
}

async function listByEnvironment(organisationId, environmentId) {
  return prisma.systemEnvironmentRoute.findMany({
    where: { organisationId, environmentId },
    orderBy: { createdAt: 'asc' },
  });
}

async function findRoute(organisationId, environmentId, domainId) {
  return prisma.systemEnvironmentRoute.findFirst({ where: { organisationId, environmentId, domainId } });
}

// Record a publication attempt for the audit trail.
async function recordAttempt(organisationId, { systemId, environmentId, domainId, status, error }) {
  return prisma.routePublicationAttempt.create({
    data: { organisationId, systemId, environmentId, domainId: domainId || null, status, error: error || null },
  });
}

async function listAttempts(organisationId, systemId, limit = 20) {
  return prisma.routePublicationAttempt.findMany({
    where: { organisationId, systemId },
    orderBy: { attemptedAt: 'desc' },
    take: limit,
  });
}

module.exports = { upsertRoute, listByEnvironment, findRoute, recordAttempt, listAttempts };
