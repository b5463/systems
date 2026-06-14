'use strict';

const Docker = require('dockerode');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { db } = require('../db');
const dockerService = require('../services/docker');

const PLATFORM_VERSION = '1.1.0';

function dataDir() {
  return process.env.SYSTEMS_DATA_DIR || process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'data');
}
function backupDir() {
  return process.env.BACKUP_DIR || path.join(dataDir(), 'backups');
}

/**
 * Read-only server + SYSTEMS.-self status.
 *
 * Never asserts a component is healthy unless it has actually observed it.
 * Anything it cannot verify from inside the API container is reported honestly
 * as `unknown` / `not_measured` / `unavailable` rather than faked as online.
 */
async function serverRoutes(fastify, options) {
  fastify.get('/api/server/info', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const info = {
      platform: {
        name: 'SYSTEMS.',
        version: PLATFORM_VERSION,
        baseDomain: process.env.BASE_DOMAIN || null,
        dashboardDomain: process.env.DASHBOARD_DOMAIN || null,
        wildcardDomain: process.env.WILDCARD_DOMAIN || null,
      },
      docker: { status: 'unavailable', managed: null, running: null },
      reverseProxy: { type: (process.env.REVERSE_PROXY || 'nginx').toLowerCase(), status: 'unknown' },
      database: { type: 'sqlite', status: 'connected' },
      wildcard: { domain: process.env.WILDCARD_DOMAIN || null, status: 'not_measured' },

      // ---- SYSTEMS. monitoring itself ----
      self: {
        version: PLATFORM_VERSION,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
      },
      disk: { status: 'not_measured', usedPct: null, freeGb: null, totalGb: null },
      backup: { status: 'not_measured', last: null, ageHours: null, count: 0 },
      defaults: dockerService.containerLimits(),
    };

    // Docker — the one component we can truly probe.
    try {
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      await docker.ping();
      info.docker.status = 'connected';
      try {
        const managed = await docker.listContainers({
          all: true,
          filters: JSON.stringify({ label: ['managed=acronym-deploy'] }),
        });
        info.docker.managed = managed.length;
        info.docker.running = managed.filter((c) => c.State === 'running').length;
      } catch { /* best-effort */ }
    } catch {
      info.docker.status = 'unavailable';
    }

    // Database — report only what we can actually query.
    try { db.prepare('SELECT 1').get(); info.database.status = 'connected'; }
    catch { info.database.status = 'unavailable'; }

    // Disk — usage of the SYSTEMS data volume (honest if unavailable).
    try {
      if (typeof fs.statfsSync === 'function') {
        const s = fs.statfsSync(dataDir());
        const total = s.blocks * s.bsize;
        const free = s.bavail * s.bsize;
        if (total > 0) {
          info.disk = {
            status: 'measured',
            usedPct: Math.round(((total - free) / total) * 1000) / 10,
            freeGb: Math.round((free / 1e9) * 10) / 10,
            totalGb: Math.round((total / 1e9) * 10) / 10,
          };
        }
      }
    } catch { /* leave not_measured */ }

    // Backup — newest timestamped backup folder under BACKUP_DIR.
    try {
      const dir = backupDir();
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      info.backup.count = dirs.length;
      if (dirs.length) {
        let newest = 0;
        for (const d of dirs) {
          const st = await fsp.stat(path.join(dir, d.name));
          if (st.mtimeMs > newest) newest = st.mtimeMs;
        }
        const ageHours = (Date.now() - newest) / 3.6e6;
        info.backup = {
          status: ageHours > 168 ? 'overdue' : 'ok',
          last: new Date(newest).toISOString(),
          ageHours: Math.round(ageHours * 10) / 10,
          count: dirs.length,
        };
      } else {
        info.backup.status = 'none';
      }
    } catch { /* leave not_measured */ }

    return info;
  });
}

module.exports = serverRoutes;
