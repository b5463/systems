'use strict';

const path = require('path');

// Zip-slip / path-traversal guard. Returns the resolved absolute path only if
// it stays within destDir; otherwise null. Pure + unit-testable.
function safeResolve(destDir, entryPath) {
  const base = path.resolve(destDir);
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
  const resolved = path.resolve(base, entryPath);
  if (resolved !== base && !resolved.startsWith(baseWithSep)) return null;
  return resolved;
}

function isWithin(destDir, entryPath) {
  return safeResolve(destDir, entryPath) !== null;
}

module.exports = { safeResolve, isWithin };
