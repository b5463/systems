'use strict';

const net = require('net');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const dockerService = require('../services/docker');
const { features } = require('../util/flags');
const { getSetting } = require('../util/settings');

const PLATFORM_VERSION = '2.0.0-rc.1';
const PLATFORM_STAGE = 'repo-complete · host validation pending';

function dataDir() {
  return process.env.SYSTEMS_DATA_DIR || process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'data');
}
function backupDir() {
  return process.env.BACKUP_DIR || path.join(dataDir(), 'backups');
}

// Short TCP probe — used to honestly check whether Postgres is reachable.
function probeTcp(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(v); } };
    const sock = net.connect({ host, port });
    sock.setTimeout(timeout);
    sock.on('connect', () => finish(true));
    sock.on('timeout', () => finish(false));
    sock.on('error', () => finish(false));
  });
}

/**
 * Read-only server + SYSTEMS.-self status.
 *
 * Shows the LOCKED target stack (Caddy + Postgres, Windows-first) and reports
 * each component's status honestly. Nothing is shown as healthy/online unless
 * it was actually observed. Things not yet wired are `planned` (V1.2) or
 * `not_configured`; things we cannot see from here are `not_measured`.
 */
async function serverRoutes(fastify, options) {
  fastify.get('/api/server/info', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const featureFlags = features();
    const backupRetention = getSetting('backupRetention');
    const backupIntervalHours = getSetting('backupIntervalHours');
    const info = {
      platform: {
        name: 'SYSTEMS.',
        version: PLATFORM_VERSION,
        stage: PLATFORM_STAGE,
        commit: process.env.SYSTEMS_COMMIT || null,
        target: 'Windows (Docker Desktop / WSL2)',
        baseDomain: process.env.BASE_DOMAIN || null,
        dashboardDomain: process.env.DASHBOARD_DOMAIN || null,
        wildcardDomain: process.env.WILDCARD_DOMAIN || null,
        dataDir: dataDir(),
        uploadMaxMb: Number(process.env.UPLOAD_MAX_MB) || 100,
        releaseRetention: getSetting('releaseRetention'),
        firewall: 'host_validation',   // verify with check-firewall-windows.ps1
        hardening: 'host_validation',  // verify with verify-hardening-windows.ps1
      },
      // Core services — locked target stack. Route generation + Postgres config
      // are implemented in the repo; connecting them is a Windows-host step.
      docker: { status: 'unavailable', managed: null, running: null },
      caddy: { type: 'caddy', status: 'host_validation' },
      postgres: { type: 'postgres', status: 'host_validation' },
      wildcard: { domain: process.env.WILDCARD_DOMAIN || null, status: 'not_measured' },

      // SYSTEMS. monitoring itself.
      self: {
        version: PLATFORM_VERSION,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
      },
      health: {
        deploymentWorker: 'in_api',  // the deploy pipeline runs in-process
        caddyConfig: 'host_validation',
        postgres: 'host_validation',
        dockerAccess: 'unavailable',
      },
      disk: { status: 'not_measured', usedPct: null, freeGb: null, totalGb: null },
      backup: {
        status: 'not_measured',
        last: null,
        ageHours: null,
        count: 0,
        destination: backupDir(),
        scheduler: featureFlags.backupScheduler ? 'enabled' : 'disabled',
        intervalHours: backupIntervalHours,
        retentionCount: backupRetention,
        restoreScript: 'scripts/restore-systems-windows.ps1',
        lastFailure: null,
      },
      defaults: dockerService.containerLimits(),
      features: featureFlags, // V2 feature flags (risky ones off by default)
    };

    // Docker — the one component we can truly probe today.
    try {
      const docker = dockerService.createDocker();
      await docker.ping();
      info.docker.status = 'connected';
      info.health.dockerAccess = 'connected';
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
      info.health.dockerAccess = 'unavailable';
    }

    // Postgres — only claim connected if a host is configured and reachable.
    const pgHost = process.env.POSTGRES_HOST;
    if (pgHost) {
      const reachable = await probeTcp(pgHost, Number(process.env.POSTGRES_PORT) || 5432);
      info.postgres.status = reachable ? 'connected' : 'unavailable';
      info.health.postgres = info.postgres.status;
    }

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
    } catch { /* not_measured */ }

    // Backups — newest timestamped folder under BACKUP_DIR.
    try {
      const dir = backupDir();
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());
      if (dirs.length) {
        let newest = 0;
        for (const d of dirs) {
          const st = await fsp.stat(path.join(dir, d.name));
          if (st.mtimeMs > newest) newest = st.mtimeMs;
        }
        const ageHours = (Date.now() - newest) / 3.6e6;
        info.backup = {
          ...info.backup,
          status: ageHours > 168 ? 'overdue' : 'ok',
          last: new Date(newest).toISOString(),
          ageHours: Math.round(ageHours * 10) / 10,
          count: dirs.length,
        };
      } else {
        info.backup.status = 'none';
      }
    } catch { /* not_measured */ }

    return info;
  });

  // Trigger an on-demand backup (online SQLite snapshot + Caddy routes).
  // Always available to an authenticated admin; the periodic scheduler is
  // gated separately behind ENABLE_BACKUP_SCHEDULER.
  fastify.post('/api/server/backup', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const backup = require('../services/backup');
    const result = await backup.runBackup();
    if (!result.ok) return reply.code(500).send({ error: result.error || 'Backup failed.' });
    return { ok: true, path: result.path, pruned: result.pruned };
  });

  // Disk-cleanup preview: orphaned images/releases + a Docker storage breakdown
  // (build cache, dangling layers, stopped containers) so the page always shows
  // a concrete reclaim target, not just "0 images".
  fastify.get('/api/server/cleanup/preview', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const diskhygiene = require('../services/diskhygiene');
    const [preview, storage] = await Promise.all([
      diskhygiene.previewCleanup(),
      diskhygiene.storageBreakdown(),
    ]);
    return { ...preview, storage };
  });

  // Run disk cleanup: remove unreferenced managed images + orphaned release dirs.
  fastify.post('/api/server/cleanup', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const diskhygiene = require('../services/diskhygiene');
    const { auditLog } = require('../db');
    const result = await diskhygiene.runCleanup();
    auditLog({ user_id: request.user.id, action: 'disk_cleanup', ip: request.ip,
      detail: `images:${result.imagesPruned} releases:${result.releasesPruned} ~${result.imagesSizeMb}MB` });
    return result;
  });

  // Reclaim Docker space: stopped containers, dangling images, build cache.
  // Never removes volumes (they may hold app data).
  fastify.post('/api/server/cleanup/prune', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const diskhygiene = require('../services/diskhygiene');
    const { auditLog } = require('../db');
    const result = await diskhygiene.pruneSystem();
    auditLog({ user_id: request.user.id, action: 'disk_cleanup', ip: request.ip,
      detail: `prune ~${result.reclaimedMb}MB` });
    return result;
  });

  // Send a test notification through the configured webhook.
  fastify.post('/api/server/notify-test', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const notify = require('../services/notify');
    const result = await notify.send({ kind: 'test', detail: 'Test notification from SYSTEMS.' });
    if (!result.sent) {
      const disabled = result.reason === 'disabled';
      return reply.code(disabled ? 409 : 502).send({
        error: disabled
          ? 'Notifications are off, or NOTIFY_WEBHOOK_URL is not set.'
          : `Webhook POST failed: ${result.reason}`,
      });
    }
    return { ok: true };
  });
}

module.exports = serverRoutes;
