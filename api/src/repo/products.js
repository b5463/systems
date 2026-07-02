'use strict';

const { prisma } = require('./client');

// V4 Phase 2 products. ORG-SCOPING RULE: every method takes organisationId
// as its first argument and filters on it — no exceptions. Route handlers
// pass the authenticated org id, never a URL parameter.

async function list(organisationId) {
  return prisma.product.findMany({
    where: { organisationId },
    orderBy: { createdAt: 'asc' },
  });
}

async function findById(organisationId, id) {
  return prisma.product.findFirst({ where: { id, organisationId } });
}

async function findBySlug(organisationId, slug) {
  return prisma.product.findUnique({
    where: { organisationId_slug: { organisationId, slug } },
  });
}

async function create(organisationId, { name, slug, status = 'draft', description = null }) {
  return prisma.product.create({
    data: { organisationId, name, slug, status, description },
  });
}

async function update(organisationId, id, patch) {
  const allowed = {};
  for (const key of ['name', 'slug', 'status', 'description']) {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  }
  const { count } = await prisma.product.updateMany({
    where: { id, organisationId },
    data: allowed,
  });
  return count ? findById(organisationId, id) : null;
}

module.exports = { list, findById, findBySlug, create, update };
