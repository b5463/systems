'use strict';

// Pure helpers for backup retention. Given existing backup folders (newest
// first or unordered) and a retention count, decide which to prune. Kept pure
// so the policy is unit-testable without touching disk.

function backupsToPrune(entries, retention) {
  const keep = Math.max(1, Number(retention) || 14);
  const sorted = [...entries].sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  return sorted.slice(keep).map((e) => e.name);
}

// A sortable, filesystem-safe UTC timestamp for a backup folder name.
function backupStamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-');
}

module.exports = { backupsToPrune, backupStamp };
