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
  return prisma.adminUser.findUnique({ where: { username } });
}

async function findById(id) {
  return prisma.adminUser.findUnique({ where: { id } });
}

async function bumpTokenVersion(id) {
  return prisma.adminUser.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
  });
}

module.exports = { create, findByUsername, findById, bumpTokenVersion };
