'use strict';

const { prisma } = require('./client');

// V4 Phase 4 domains. ORG-SCOPING RULE: every method takes organisationId as
// its first argument and filters on it — no exceptions (hostname lookups are
// the one documented cross-org exception, since hostnames are platform-unique).

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

// Store a freshly-issued verification token + its expiry on the domain (resets
// any prior verified state — re-verification starts clean).
async function setVerification(organisationId, id, { token, method, expiresAt }) {
  const { count } = await prisma.domain.updateMany({
    where: { id, organisationId },
    data: {
      verificationToken: token, verificationMethod: method,
      verificationExpiresAt: expiresAt, verified: false, verifiedAt: null, lastError: null,
    },
  });
  return count > 0;
}

async function markVerified(organisationId, id, now = new Date()) {
  const { count } = await prisma.domain.updateMany({
    where: { id, organisationId },
    data: { verified: true, verifiedAt: now, verificationToken: null, verificationExpiresAt: null, lastError: null },
  });
  return count > 0;
}

async function markVerificationFailed(organisationId, id, reason) {
  await prisma.domain.updateMany({
    where: { id, organisationId },
    data: { lastError: reason },
  });
}

// Designate a single canonical hostname for a system (clears the flag on the
// system's other domains in the same transaction).
async function setCanonical(organisationId, systemId, id) {
  return prisma.$transaction(async (tx) => {
    await tx.domain.updateMany({ where: { organisationId, systemId }, data: { isCanonical: false } });
    const { count } = await tx.domain.updateMany({ where: { id, organisationId, systemId }, data: { isCanonical: true } });
    return count > 0;
  });
}

module.exports = {
  listBySystem, findById, findByHostname, createCustom, remove,
  setVerification, markVerified, markVerificationFailed, setCanonical,
};
