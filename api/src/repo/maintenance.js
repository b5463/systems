'use strict';

// V4 Phase 4 — maintenance windows. ORG-SCOPING RULE: every method takes
// organisationId first and filters on it.

const { prisma } = require('./client');

async function listBySystem(organisationId, systemId) {
  return prisma.maintenanceWindow.findMany({
    where: { organisationId, systemId },
    orderBy: { startsAt: 'desc' },
  });
}

async function create(organisationId, { systemId, environmentId, message, startsAt, endsAt, createdBy }) {
  return prisma.maintenanceWindow.create({
    data: { organisationId, systemId, environmentId: environmentId || null, message, startsAt, endsAt, createdBy: createdBy || null },
  });
}

async function findById(organisationId, id) {
  return prisma.maintenanceWindow.findFirst({ where: { id, organisationId } });
}

async function remove(organisationId, id) {
  const { count } = await prisma.maintenanceWindow.deleteMany({ where: { id, organisationId } });
  return count > 0;
}

// Is a maintenance window currently in effect for this environment? A window
// with a null environmentId covers the whole system. `now` is a Date.
async function activeFor(organisationId, systemId, environmentId, now = new Date()) {
  const row = await prisma.maintenanceWindow.findFirst({
    where: {
      organisationId, systemId, active: true,
      startsAt: { lte: now }, endsAt: { gte: now },
      OR: [{ environmentId: null }, { environmentId }],
    },
    orderBy: { startsAt: 'desc' },
  });
  return row || null;
}

module.exports = { listBySystem, create, findById, remove, activeFor };
