'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { db } = require('../db');
const { createDocker } = require('./docker');
const { DATA_DIR } = require('../util/paths');

const docker = createDocker();

function deploymentsDir() {
  return process.env.DEPLOYMENTS_DIR || path.join(DATA_DIR, 'releases');
}

// All image IDs currently referenced by any project (current + rollback).
// Includes soft-deleted rows because they still hold images until purged.
function referencedImageIds() {
  const rows = db
    .prepare('SELECT image_id, previous_image_id FROM projects')
    .all();
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

// Returns how much could be reclaimed without actually removing anything.
async function previewCleanup() {
  const result = { images: { count: 0, sizeMb: 0 }, releases: { count: 0 } };

  try {
    const images = await managedImages();
    const refIds = referencedImageIds();
    const prunable = images.filter((img) => !idMatches(img.Id, refIds));
    result.images.count = prunable.length;
    result.images.sizeMb = Math.round(
      prunable.reduce((sum, img) => sum + (img.Size || 0), 0) / (1024 * 1024)
    );
  } catch { /* Docker unavailable */ }

  try {
    const dir = deploymentsDir();
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const knownSlugs = new Set(
      db.prepare('SELECT slug FROM projects').all().map((r) => r.slug)
    );
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
    const refIds = referencedImageIds();
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
    const knownSlugs = new Set(
      db.prepare('SELECT slug FROM projects').all().map((r) => r.slug)
    );
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

module.exports = { previewCleanup, runCleanup };
