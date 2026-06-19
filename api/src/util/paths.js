'use strict';

const path = require('path');

// Cross-platform data directory. A hardcoded '/var/lib/systems' is a Linux-only
// path; on the Windows host this resolves nowhere. Honor the explicit env
// overrides first, otherwise fall back to a repo-local 'data' dir (the same
// resolution the SQLite layer uses), so nothing assumes a Linux filesystem.
const DATA_DIR =
  process.env.SYSTEMS_DATA_DIR ||
  process.env.DATA_DIR ||
  path.join(__dirname, '..', '..', '..', 'data');

module.exports = { DATA_DIR };
