'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { db, auditLog } = require('../db');
const dockerService = require('./docker');
const notify = require('./notify');
const health = require('./health');
const { reconcileStatus } = require('../util/reconcile');
const { evaluateAlerts, alertDelta } = require('../util/alerts');
const { getSetting } = require('../util/settings');

// Reconcile DB status against actual Docker container state. The DB otherwise
// only records the last *action*; this corrects drift from crashes, OOM kills,
// and host reboots so the dashboard reflects reality.

let timer = null;
let running = false;
let prevAlerts = [];

function dataDir() {
  return (
    process.env.SYSTEMS_DATA_DIR ||
    process.env.DATA_DIR ||
    path.join(__dirname, '..', '..', '..', 'data')
  );
}

// Build a lightweight info snapshot for alert evaluation from locally-available
// state — no extra TCP probes (Postgres is not checked here; that lives in the
// server/info handler which has the full context on request).
async function buildInfoSnapshot(dockerOk) {
  const info = {
    docker: { status: dockerOk ? 'connected' : 'unavailable' },
    disk: { status: 'not_measured', usedPct: null },
    backup: { status: 'not_measured', ageHours: null },
    postgres: { status: 'host_validation' },
  };

  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(dataDir());
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      if (total > 0) {
        info.disk = {
          status: 'measured',
          usedPct: Math.round(((total - free) / total) * 1000) / 10,
        };
      }
    }
  } catch { /* not_measured */ }

  try {
    const bdir = process.env.BACKUP_DIR || path.join(dataDir(), 'backups');
    const entries = await fsp.readdir(bdir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length) {
      let newest = 0;
      for (const d of dirs) {
        const st = await fsp.stat(path.join(bdir, d.name));
        if (st.mtimeMs > newest) newest = st.mtimeMs;
      }
      const ageHours = (Date.now() - newest) / 3.6e6;
      info.backup = { status: ageHours > 168 ? 'overdue' : 'ok', ageHours };
    } else {
      info.backup.status = 'none';
    }
  } catch { /* not_measured */ }

  try {
    info.systems = db.prepare(`
      SELECT p.slug, p.health_failures,
        s.cpu_percent,
        CASE WHEN s.memory_limit_mb > 0 THEN (s.memory_mb / s.memory_limit_mb) * 100 ELSE NULL END AS memory_percent
      FROM projects p
      LEFT JOIN stats_history s ON s.id = (
        SELECT id FROM stats_history WHERE project_id = p.id ORDER BY recorded_at DESC, id DESC LIMIT 1
      )
      WHERE p.status = 'running'
    `).all().map((row) => ({
      slug: row.slug,
      healthFailures: row.health_failures || 0,
      cpuPercent: row.cpu_percent,
      memoryPercent: row.memory_percent,
    }));
  } catch { info.systems = []; }

  return info;
}

async function reconcileOnce() {
  if (running) return { skipped: true };
  running = true;

  const changes = [];
  let dockerOk = false;
  let result;

  try {
    let containers = [];
    try {
      containers = await dockerService.listManagedContainers();
      dockerOk = true;
    } catch {
      result = { error: 'docker_unavailable' };
    }

    if (!result) {
      // Index managed containers by id (full + short) and by name (deploy_<slug>).
      const byId = new Map();
      const byName = new Map();
      for (const c of containers) {
        if (c.Id) { byId.set(c.Id, c); byId.set(c.Id.slice(0, 12), c); }
        for (const n of c.Names || []) byName.set(n.replace(/^\//, ''), c);
      }

      const projects = db
        .prepare(`SELECT id, slug, status, container_id FROM projects WHERE status NOT IN ('deleted')`)
        .all();

      for (const p of projects) {
        let container = null;
        if (p.container_id) {
          container = byId.get(p.container_id) || byId.get(String(p.container_id).slice(0, 12)) || null;
        }
        // Fall back to the deterministic container name (handles redeploy id drift).
        if (!container) container = byName.get(`deploy_${p.slug}`) || null;

        const next = reconcileStatus(p, container);
        if (next && next !== p.status) {
          db.prepare(`UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(next, p.id);
          auditLog({ action: 'reconcile', target: p.slug, detail: `${p.status} → ${next}` });
          changes.push({ slug: p.slug, from: p.status, to: next });
          if (next === 'error') {
            notify.send({ kind: 'system_error', slug: p.slug, detail: `status drifted ${p.status} → error` }).catch(() => {});
          }
        }
      }

      // Local development has no DNS/TLS route. Refresh persisted health from
      // each running system's host port so old public-probe failures self-correct
      // on boot and during the normal reconciliation cycle.
      if (health.isLocalMode()) {
        const runningProjects = db.prepare(
          `SELECT slug, port, route_published, health_state, health_path
           FROM projects WHERE status = 'running' AND port IS NOT NULL`
        ).all();
        await Promise.all(runningProjects.map(async (project) => {
          const target = health.targetFor(project);
          if (!target) return;
          const observed = await health.checkSystem(target, project.health_path || '/');
          db.prepare(
            `UPDATE projects
             SET health_state = ?, health_status = ?, health_response_ms = ?, health_checked_at = ?
             WHERE slug = ?`
          ).run(observed.state, observed.httpStatus, observed.responseMs, observed.checkedAt, project.slug);
          db.prepare(`UPDATE projects SET health_failures = CASE WHEN ? = 'healthy' THEN 0 ELSE health_failures + 1 END WHERE slug = ?`)
            .run(observed.state, project.slug);
          if (observed.state !== project.health_state) {
            auditLog({
              action: observed.state === 'healthy' ? 'health_ok' : 'health_fail',
              target: project.slug,
              detail: `${observed.state} ${observed.httpStatus ?? ''}`.trim(),
            });
          }
        }));
      }

      // Recover interrupted builds: a row stuck in 'building' past ~3x the build
      // timeout can't finish (the in-process build died with a restart), and
      // reconcileStatus deliberately skips 'building' — so handle it explicitly.
      const stuckMs = (Number(process.env.BUILD_TIMEOUT_SECONDS) || 600) * 1000 * 3;
      const stuck = db.prepare(
        `SELECT slug, status FROM projects WHERE status = 'building'
         AND (julianday('now') - julianday(updated_at)) * 86400000 > ?`
      ).all(stuckMs);
      for (const s of stuck) {
        db.prepare(`UPDATE projects SET status = 'error', updated_at = datetime('now') WHERE slug = ?`).run(s.slug);
        auditLog({ action: 'build_stuck', target: s.slug, detail: 'recovered to error after timeout' });
        changes.push({ slug: s.slug, from: 'building', to: 'error' });
        notify.send({ kind: 'system_error', slug: s.slug, detail: 'build stuck → error' }).catch(() => {});
      }

      result = { changes };
    }
  } finally {
    running = false;
  }

  // Alert evaluation — runs after project reconcile regardless of Docker state.
  // Fires a notification only when an alert is newly raised (transition-based),
  // not on every poll cycle.
  buildInfoSnapshot(dockerOk)
    .then((snapshot) => {
      const next = evaluateAlerts(snapshot, {
        backupOverdueHours: getSetting('backupOverdueHours'),
        memoryPercent: getSetting('alertMemoryPercent'),
        cpuPercent: getSetting('alertCpuPercent'),
        healthFailures: getSetting('alertHealthFailures'),
      });
      const { raised } = alertDelta(prevAlerts, next);
      prevAlerts = next;
      for (const a of raised) {
        notify
          .send({ kind: 'alert_raised', detail: `[${a.severity}] ${a.message}` })
          .catch(() => {});
      }
    })
    .catch(() => {});

  return result;
}

function start() {
  const configured = Number(process.env.RECONCILE_INTERVAL_SEC);
  const sec = Number.isFinite(configured) ? configured : 30;
  if (sec <= 0) return; // explicitly disabled
  reconcileOnce().catch(() => {});
  timer = setInterval(() => { reconcileOnce().catch(() => {}); }, sec * 1000);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { reconcileOnce, start, stop };
