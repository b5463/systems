'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { projectRepo } = require('../repo');
const { createDocker } = require('./docker');
const { DATA_DIR } = require('../util/paths');

const docker = createDocker();

function deploymentsDir() {
  return process.env.DEPLOYMENTS_DIR || path.join(DATA_DIR, 'releases');
}

// All image IDs currently referenced by any project (current + rollback).
// Includes soft-deleted rows because they still hold images until purged.
async function referencedImageIds() {
  const rows = await projectRepo.getAllImageIds();
  const ids = new Set();
  for (const r of rows) {
    if (r.image_id) ids.add(r.image_id);
    if (r.previous_image_id) ids.add(r.previous_image_id);
  }
  return ids;
}

// Handles sha256: prefix and short vs. full IDs. Short IDs are valid prefixes
// of full IDs; either direction of prefix match counts as a hit.
function idMatches(fullDockerImageId, storedIds) {
  const norm = (id) => (id || '').replace(/^sha256:/, '').toLowerCase();
  const full = norm(fullDockerImageId);
  for (const s of storedIds) {
    const n = norm(s);
    if (!n) continue;
    if (full === n || full.startsWith(n) || n.startsWith(full)) return true;
  }
  return false;
}

async function managedImages() {
  const all = await docker.listImages({ all: false });
  return all.filter(
    (img) =>
      img.RepoTags && img.RepoTags.some((t) => t.startsWith('acronym-deploy/'))
  );
}

// Where Docker is actually using disk (read-only). The orphaned-image count is
// often 0 while build cache / dangling layers hold gigabytes — this surfaces
// that so "disk critical" always comes with a concrete reclaim target.
async function storageBreakdown() {
  const out = { buildCacheMb: 0, danglingImagesMb: 0, stoppedContainers: 0, unusedVolumesMb: 0, available: false };
  try {
    const df = await docker.df();
    out.available = true;
    if (Array.isArray(df.BuildCache)) {
      out.buildCacheMb = Math.round(df.BuildCache.filter((b) => !b.InUse).reduce((s, b) => s + (b.Size || 0), 0) / 1048576);
    }
    if (Array.isArray(df.Images)) {
      out.danglingImagesMb = Math.round(df.Images
        .filter((i) => !i.RepoTags || i.RepoTags.length === 0 || i.RepoTags[0] === '<none>:<none>')
        .reduce((s, i) => s + (i.Size || 0), 0) / 1048576);
    }
    if (Array.isArray(df.Containers)) {
      out.stoppedContainers = df.Containers.filter((c) => (c.State || '').toLowerCase() !== 'running').length;
    }
    if (Array.isArray(df.Volumes)) {
      out.unusedVolumesMb = Math.round(df.Volumes
        .filter((v) => v.UsageData && v.UsageData.RefCount === 0)
        .reduce((s, v) => s + ((v.UsageData && v.UsageData.Size) || 0), 0) / 1048576);
    }
  } catch { /* docker unavailable */ }
  return out;
}

// Reclaim safe-to-remove Docker space: stopped containers, dangling images, and
// build cache. Never touches volumes (they may hold app data).
async function pruneSystem() {
  const result = { reclaimedMb: 0, errors: [] };
  try {
    const c = await docker.pruneContainers();
    result.reclaimedMb += Math.round((c.SpaceReclaimed || 0) / 1048576);
  } catch (e) { result.errors.push(`Containers: ${e.message}`); }
  try {
    const i = await docker.pruneImages({ filters: { dangling: { true: true } } });
    result.reclaimedMb += Math.round((i.SpaceReclaimed || 0) / 1048576);
  } catch (e) { result.errors.push(`Images: ${e.message}`); }
  try {
    if (typeof docker.pruneBuilder === 'function') {
      const b = await docker.pruneBuilder();
      result.reclaimedMb += Math.round((b.SpaceReclaimed || 0) / 1048576);
    }
  } catch (e) { result.errors.push(`Build cache: ${e.message}`); }
  if (!result.errors.length) delete result.errors;
  return result;
}

// Returns how much could be reclaimed without actually removing anything.
async function previewCleanup() {
  const result = { images: { count: 0, sizeMb: 0 }, releases: { count: 0 } };

  try {
    const images = await managedImages();
    const refIds = await referencedImageIds();
    const prunable = images.filter((img) => !idMatches(img.Id, refIds));
    result.images.count = prunable.length;
    result.images.sizeMb = Math.round(
      prunable.reduce((sum, img) => sum + (img.Size || 0), 0) / (1024 * 1024)
    );
  } catch { /* Docker unavailable */ }

  try {
    const dir = deploymentsDir();
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const slugs = await projectRepo.getAllSlugs();
    const knownSlugs = new Set(slugs);
    result.releases.count = entries.filter(
      (e) => e.isDirectory() && !knownSlugs.has(e.name)
    ).length;
  } catch { /* no releases dir */ }

  return result;
}

// Remove orphaned images and release dirs that aren't referenced for rollback.
async function runCleanup() {
  const errors = [];
  let imagesPruned = 0;
  let imagesSizeMb = 0;
  let releasesPruned = 0;

  try {
    const images = await managedImages();
    const refIds = await referencedImageIds();
    const prunable = images.filter((img) => !idMatches(img.Id, refIds));
    imagesSizeMb = Math.round(
      prunable.reduce((sum, img) => sum + (img.Size || 0), 0) / (1024 * 1024)
    );
    for (const img of prunable) {
      try {
        await docker.getImage(img.Id).remove({ force: false });
        imagesPruned++;
      } catch (e) {
        errors.push(`Image ${img.Id.slice(-12)}: ${e.message}`);
      }
    }
  } catch (e) {
    if (!['ENOENT', 'ECONNREFUSED', 'EACCES'].includes(e.code)) {
      errors.push(`Docker: ${e.message}`);
    }
  }

  try {
    const dir = deploymentsDir();
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const slugs = await projectRepo.getAllSlugs();
    const knownSlugs = new Set(slugs);
    for (const e of entries.filter(
      (x) => x.isDirectory() && !knownSlugs.has(x.name)
    )) {
      try {
        await fsp.rm(path.join(dir, e.name), { recursive: true, force: true });
        releasesPruned++;
      } catch (err) {
        errors.push(`Release dir ${e.name}: ${err.message}`);
      }
    }
  } catch { /* no releases dir, fine */ }

  return {
    imagesPruned,
    imagesSizeMb,
    releasesPruned,
    errors: errors.length ? errors : undefined,
  };
}

module.exports = { previewCleanup, runCleanup, storageBreakdown, pruneSystem };
