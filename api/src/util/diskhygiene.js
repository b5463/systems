'use strict';

// Pure decisions for safe disk cleanup. The cardinal rule: never return
// anything still referenced for rollback. No I/O — the service layer does the
// actual `docker image rm` / `fs.rm` based on these decisions.

/**
 * Managed deploy images safe to remove: those whose Id is NOT in the referenced
 * set (each system's current + previous image, plus any explicitly kept).
 * @param {Array<{Id:string}>} images  managed deploy images (e.g. from docker.listImages)
 * @param {Iterable<string>} referencedIds  image ids to keep
 * @returns {string[]} image ids safe to prune
 */
function imagesToPrune(images, referencedIds) {
  const keep = new Set(referencedIds || []);
  return (images || [])
    .filter((img) => img && img.Id && !keep.has(img.Id))
    .map((img) => img.Id);
}

/**
 * Release folders safe to remove: keep the newest `retention`, ALWAYS keep any
 * referenced (rollback) release, prune the rest.
 * @param {Array<{name:string, mtimeMs:number}>} entries
 * @param {number} retention  how many recent releases to keep (min 1)
 * @param {Iterable<string>} referencedNames  release dir names to keep (rollback targets)
 * @returns {string[]} release dir names safe to prune
 */
function releasesToPrune(entries, retention, referencedNames) {
  const n = Number(retention);
  const keepCount = Math.max(1, Number.isFinite(n) ? n : 3);
  const referenced = new Set(referencedNames || []);
  const sorted = [...(entries || [])].sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  const keptByAge = new Set(sorted.slice(0, keepCount).map((e) => e.name));
  return sorted
    .filter((e) => !keptByAge.has(e.name) && !referenced.has(e.name))
    .map((e) => e.name);
}

module.exports = { imagesToPrune, releasesToPrune };
