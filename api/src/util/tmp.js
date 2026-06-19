'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Cross-platform temp base. A hardcoded '/tmp' does not exist on Windows
// (it resolves to C:\tmp), which broke uploads with ENOENT. Honor an explicit
// TMP_DIR override, otherwise use a 'systems' subdir of the OS temp dir.
const TMP_DIR = process.env.TMP_DIR || path.join(os.tmpdir(), 'systems');

function ensureTmp() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

// Absolute path to a fresh temp .zip (parent dir guaranteed to exist).
function tmpZip() {
  return path.join(ensureTmp(), `${uuidv4()}.zip`);
}

// Absolute path to a fresh temp directory name (caller creates it, e.g. on extract).
function tmpDir() {
  return path.join(ensureTmp(), uuidv4());
}

module.exports = { TMP_DIR, ensureTmp, tmpZip, tmpDir };
