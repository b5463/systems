'use strict';

const { prisma } = require('./client');

// V4 Phase 4 domains (partial — read/write on the Domain table Alex's Phase 2
// bridge already creates). ORG-SCOPING RULE: every method takes
// organisationId as its first argument and filters on it — no exceptions.
//
// What this does NOT do yet (Alex's remaining Phase 4 work):
//   - DNS TXT/CNAME/A verification (verified stays false until that lands)
//   - route_status enum / system_environment_routes junction table
//   - Caddy renderRoute() wiring — adding a domain here does not publish a route
//   - maintenance_windows — no maintenance-mode table exists
//   - canonical redirect selection — no canonical column exists

async function listBySystem(organisationId, systemId) {
  return prisma.domain.findMany({
    where: { organisationId, systemId },
    orderBy: [{ isCustom: 'asc' }, { createdAt: 'asc' }],
  });
}

async function findById(organisationId, id) {
  return prisma.domain.findFirst({ where: { id, organisationId } });
}

// hostname is globally unique across organisations by design (two orgs must
// never be able to register the same hostname), so this lookup is
// intentionally cross-org rather than a scoped read.
async function findByHostname(hostname) {
  // org-scope-exempt: hostname uniqueness is deliberately platform-wide
  return prisma.domain.findUnique({ where: { hostname } });
}

async function createCustom(organisationId, { systemId, hostname }) {
  return prisma.domain.create({
    data: { organisationId, systemId, hostname, isCustom: true, verified: false },
  });
}

async function remove(organisationId, id) {
  const { count } = await prisma.domain.deleteMany({ where: { id, organisationId, isCustom: true } });
  return count > 0;
}

module.exports = { listBySystem, findById, findByHostname, createCustom, remove };
