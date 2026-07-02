'use strict';

const { prisma } = require('./client');

// V4 Phase 1. Single-tenant today: everything belongs to the default
// organisation until multi-org actually ships. ensureDefault() is idempotent
// and safe to call from any V4 code path that needs an organisation id.

const DEFAULT_SLUG = 'acronym';
const DEFAULT_NAME = 'Acronym';

async function ensureDefault() {
  return prisma.organisation.upsert({
    where: { slug: DEFAULT_SLUG },
    update: {},
    create: { slug: DEFAULT_SLUG, name: DEFAULT_NAME },
  });
}

async function create({ name, slug }) {
  return prisma.organisation.create({ data: { name, slug } });
}

async function findBySlug(slug) {
  return prisma.organisation.findUnique({ where: { slug } });
}

async function findById(id) {
  return prisma.organisation.findUnique({ where: { id } });
}

module.exports = { DEFAULT_SLUG, ensureDefault, create, findBySlug, findById };
