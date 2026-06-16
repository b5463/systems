'use strict';

const { db, auditLog } = require('../db');
const dockerService = require('./docker');
const notify = require('./notify');
const { reconcileStatus } = require('../util/reconcile');

// Reconcile DB status against actual Docker container state. The DB otherwise
// only records the last *action*; this corrects drift from crashes, OOM kills,
// and host reboots so the dashboard reflects reality.

let timer = null;
let running = false;

async function reconcileOnce() {
  if (running) return { skipped: true };
  running = true;
  const changes = [];
  try {
    let containers = [];
    try {
      containers = await dockerService.listManagedContainers();
    } catch {
      return { error: 'docker_unavailable' };
    }

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
  } finally {
    running = false;
  }
  return { changes };
}

function start() {
  const sec = Number(process.env.RECONCILE_INTERVAL_SEC) || 30;
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
