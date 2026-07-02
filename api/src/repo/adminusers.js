'use strict';

const { prisma } = require('./client');

// V4 Phase 1 admin users (org-scoped, UUID keys). These will replace the
// legacy `users` table once V4 auth cuts over; until then nothing reads them
// outside V4 code paths.

async function create({ organisationId, username, passwordHash, role = 'admin' }) {
  return prisma.adminUser.create({
    data: { organisationId, username, passwordHash, role },
  });
}

async function findByUsername(username) {
  // org-scope-exempt: login-time lookup — usernames are globally unique by design
  return prisma.adminUser.findUnique({ where: { username } });
}

async function findById(id) {
  // org-scope-exempt: lookup by UUID PK from a verified session
  return prisma.adminUser.findUnique({ where: { id } });
}

async function bumpTokenVersion(id) {
  // org-scope-exempt: revocation by UUID PK from a verified session
  return prisma.adminUser.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
  });
}

module.exports = { create, findByUsername, findById, bumpTokenVersion };
