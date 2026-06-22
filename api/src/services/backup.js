'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { auditRepo } = require('../repo');
const notify = require('./notify');
const { backupsToPrune, backupStamp } = require('../util/backup');
const { getSetting } = require('../util/settings');

const execFileAsync = promisify(execFile);

// Node-native backups. Uses pg_dump to create a consistent database backup.
// Copies the platform DB and, when present, the Caddy routes directory into a
// timestamped folder under BACKUP_DIR, writes a manifest, and prunes old backups.
//
// A manual backup is always available to admins; the scheduler that runs this
// on an interval is gated behind ENABLE_BACKUP_SCHEDULER (off by default).

let timer = null;
let running = false;

function dataDir() {
  return process.env.SYSTEMS_DATA_DIR || process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'data');
}
function backupDir() {
  return process.env.BACKUP_DIR || path.join(dataDir(), 'backups');
}

async function runBackup() {
  if (running) return { skipped: true };
  running = true;
  const stamp = backupStamp();
  const dest = path.join(backupDir(), stamp);
  try {
    await fsp.mkdir(dest, { recursive: true });

    // Database backup via pg_dump (consistent snapshot).
    await execFileAsync('pg_dump', [
      '--format=custom',
      '--file=' + path.join(dest, 'platform.pgdump'),
      process.env.DATABASE_URL,
    ]);

    // Caddy routes, if configured and present (best-effort).
    let caddyCopied = false;
    const routesDir = process.env.CADDY_ROUTES_DIR;
    if (routesDir && fs.existsSync(routesDir)) {
      try {
        await fsp.cp(routesDir, path.join(dest, 'caddy-routes'), { recursive: true });
        caddyCopied = true;
      } catch { /* best-effort */ }
    }

    const manifest = {
      created_at: new Date().toISOString(),
      platform_db: true,
      caddy_routes: caddyCopied,
      systems_version: '2.0.0-rc.1',
    };
    await fsp.writeFile(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Prune old backups by retention count.
    let pruned = 0;
    try {
      const entries = await fsp.readdir(backupDir(), { withFileTypes: true });
      const dirs = [];
      for (const e of entries.filter((x) => x.isDirectory())) {
        const st = await fsp.stat(path.join(backupDir(), e.name));
        dirs.push({ name: e.name, mtimeMs: st.mtimeMs });
      }
      for (const name of backupsToPrune(dirs, getSetting('backupRetention'))) {
        await fsp.rm(path.join(backupDir(), name), { recursive: true, force: true });
        pruned++;
      }
    } catch { /* best-effort */ }

    await auditRepo.appendAudit({ action: 'backup_succeeded', detail: `${stamp}${caddyCopied ? ' +caddy' : ''}` });
    return { ok: true, path: dest, pruned };
  } catch (e) {
    await auditRepo.appendAudit({ action: 'backup_failed', detail: e.message });
    notify.send({ kind: 'backup_failed', detail: e.message }).catch(() => {});
    // Clean up a half-written backup folder.
    try { await fsp.rm(dest, { recursive: true, force: true }); } catch {}
    return { ok: false, error: e.message };
  } finally {
    running = false;
  }
}

function start() {
  const { features } = require('../util/flags');
  if (!features().backupScheduler) return; // off by default
  const hours = getSetting('backupIntervalHours');
  if (hours <= 0) return;
  timer = setInterval(() => { runBackup().catch(() => {}); }, hours * 3.6e6);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { runBackup, start, stop, backupDir };
