'use strict';

const { prisma } = require('./client');

// V4 Phase 5 portfolio CMS. ORG-SCOPING RULE: every method takes
// organisationId as its first argument and filters on it — no exceptions
// (see api/scripts/lint-org-scoping.js).

// ---- Pages ----

async function listPages(organisationId, locale) {
  return prisma.portfolioPage.findMany({
    where: { organisationId, ...(locale ? { locale } : {}) },
    orderBy: [{ pageType: 'asc' }, { slug: 'asc' }],
  });
}

async function findPageById(organisationId, id) {
  return prisma.portfolioPage.findFirst({ where: { id, organisationId } });
}

async function upsertPage(organisationId, { id, locale, pageType, slug, title, seoTitle, seoDescription, content, status }) {
  const data = { organisationId, locale, pageType, slug, title, seoTitle, seoDescription, content, status: status || 'draft' };
  if (id) {
    const { count } = await prisma.portfolioPage.updateMany({ where: { id, organisationId }, data });
    return count ? findPageById(organisationId, id) : null;
  }
  return prisma.portfolioPage.create({ data });
}

// ---- Product profiles ----

async function listProfiles(organisationId, locale) {
  return prisma.productPortfolioProfile.findMany({
    where: { organisationId, ...(locale ? { locale } : {}) },
    orderBy: { productId: 'asc' },
  });
}

async function upsertProfile(organisationId, data) {
  const { scoreProfileCompleteness } = require('../services/portfolioPublish');
  const completenessScore = scoreProfileCompleteness(data);
  const payload = { ...data, organisationId, completenessScore };
  if (data.id) {
    const { id, ...rest } = payload;
    const { count } = await prisma.productPortfolioProfile.updateMany({ where: { id, organisationId }, data: rest });
    return count ? prisma.productPortfolioProfile.findFirst({ where: { id, organisationId } }) : null;
  }
  return prisma.productPortfolioProfile.create({ data: payload });
}

// ---- Blocks ----

async function listBlocks(organisationId, ownerType, ownerId, locale) {
  return prisma.portfolioBlock.findMany({
    where: { organisationId, ownerType, ownerId, ...(locale ? { locale } : {}) },
    orderBy: { position: 'asc' },
  });
}

async function upsertBlock(organisationId, { id, ownerType, ownerId, locale, blockType, position, data }) {
  const payload = { organisationId, ownerType, ownerId, locale, blockType, position, data: JSON.stringify(data) };
  if (id) {
    const { count } = await prisma.portfolioBlock.updateMany({ where: { id, organisationId }, data: payload });
    return count ? prisma.portfolioBlock.findFirst({ where: { id, organisationId } }) : null;
  }
  return prisma.portfolioBlock.create({ data: payload });
}

async function deleteBlock(organisationId, id) {
  const { count } = await prisma.portfolioBlock.deleteMany({ where: { id, organisationId } });
  return count > 0;
}

// ---- Redirects ----

async function listRedirects(organisationId, locale) {
  return prisma.portfolioRedirect.findMany({ where: { organisationId, ...(locale ? { locale } : {}) } });
}

async function createRedirect(organisationId, { locale, fromPath, toPath, statusCode }) {
  return prisma.portfolioRedirect.create({
    data: { organisationId, locale, fromPath, toPath, statusCode: statusCode || 301 },
  });
}

async function deleteRedirect(organisationId, id) {
  const { count } = await prisma.portfolioRedirect.deleteMany({ where: { id, organisationId } });
  return count > 0;
}

// ---- Legal versions ----

async function listLegalVersions(organisationId, locale) {
  return prisma.legalVersion.findMany({
    where: { organisationId, ...(locale ? { locale } : {}) },
    orderBy: { effectiveAt: 'desc' },
  });
}

async function createLegalVersion(organisationId, { locale, docType, version, content, effectiveAt }) {
  return prisma.legalVersion.create({
    data: { organisationId, locale, docType, version, content, effectiveAt: new Date(effectiveAt) },
  });
}

// ---- Media ----

async function listMedia(organisationId, status) {
  return prisma.mediaAsset.findMany({
    where: { organisationId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

// ---- Snapshots ----

async function latestSnapshot(organisationId, locale) {
  return prisma.portfolioSnapshot.findFirst({
    where: { organisationId, locale },
    orderBy: { version: 'desc' },
  });
}

async function listSnapshots(organisationId, locale, limit = 20) {
  return prisma.portfolioSnapshot.findMany({
    where: { organisationId, ...(locale ? { locale } : {}) },
    orderBy: { version: 'desc' },
    take: limit,
  });
}

async function createSnapshot(organisationId, { locale, content, contentHash, schemaVersion, publishedBy }) {
  const prev = await latestSnapshot(organisationId, locale);
  const version = (prev?.version || 0) + 1;
  return prisma.portfolioSnapshot.create({
    data: {
      organisationId, locale, version, content: JSON.stringify(content), contentHash,
      schemaVersion, publishedBy: publishedBy || null,
    },
  });
}

// Rollback = publish a new snapshot whose content is copied from an older
// one. Snapshots are immutable — rollback never mutates or deletes history.
async function rollbackToSnapshot(organisationId, locale, targetVersion, publishedBy) {
  const target = await prisma.portfolioSnapshot.findFirst({ where: { organisationId, locale, version: targetVersion } });
  if (!target) throw new Error(`Snapshot v${targetVersion} not found for locale ${locale}`);
  const prev = await latestSnapshot(organisationId, locale);
  const version = (prev?.version || 0) + 1;
  return prisma.portfolioSnapshot.create({
    data: {
      organisationId, locale, version, content: target.content, contentHash: target.contentHash,
      schemaVersion: target.schemaVersion, publishedBy: publishedBy || null,
    },
  });
}

module.exports = {
  listPages, findPageById, upsertPage,
  listProfiles, upsertProfile,
  listBlocks, upsertBlock, deleteBlock,
  listRedirects, createRedirect, deleteRedirect,
  listLegalVersions, createLegalVersion,
  listMedia,
  latestSnapshot, listSnapshots, createSnapshot, rollbackToSnapshot,
};
