'use strict';

// Pure threshold-alert evaluation. Given a server-status snapshot (the same
// shape as GET /api/server/info), return a list of actionable alerts. No I/O,
// so the policy is unit-testable. Reuses the shared threshold helpers.

const { diskTone, backupOverdue } = require('./thresholds');

/**
 * @param {object} info  server status (info.disk, info.backup, info.docker, info.postgres)
 * @param {object} [opts] { backupOverdueHours = 168 }
 * @returns {Array<{key:string, severity:'warning'|'critical', message:string}>}
 */
function evaluateAlerts(info = {}, opts = {}) {
  const backupOverdueHours = Number(opts.backupOverdueHours) || 168;
  const alerts = [];

  const disk = info.disk || {};
  if (disk.status === 'measured' && Number.isFinite(disk.usedPct)) {
    const tone = diskTone(disk.usedPct);
    if (tone === 'error') alerts.push({ key: 'disk', severity: 'critical', message: `Disk ${disk.usedPct}% full` });
    else if (tone === 'warn') alerts.push({ key: 'disk', severity: 'warning', message: `Disk ${disk.usedPct}% full` });
  }

  const backup = info.backup || {};
  if (backup.status === 'none') {
    alerts.push({ key: 'backup', severity: 'warning', message: 'No backups yet' });
  } else if (backup.status === 'overdue' || backupOverdue(backup.ageHours, backupOverdueHours)) {
    const age = Number.isFinite(backup.ageHours) ? `${Math.round(backup.ageHours)}h ago` : 'overdue';
    alerts.push({ key: 'backup', severity: 'warning', message: `Last backup ${age}` });
  }

  if ((info.docker || {}).status === 'unavailable') {
    alerts.push({ key: 'docker', severity: 'critical', message: 'Docker not connected' });
  }
  // Only alert when Postgres was configured and probed unreachable — never for
  // the "host_validation"/"not_measured" default.
  if ((info.postgres || {}).status === 'unavailable') {
    alerts.push({ key: 'postgres', severity: 'warning', message: 'Postgres unreachable' });
  }

  return alerts;
}

/**
 * Compare two alert lists by `key` to drive notify-on-transition (so we alert
 * when a condition first appears or clears, not on every poll).
 */
function alertDelta(prev = [], next = []) {
  const prevKeys = new Set(prev.map((a) => a.key));
  const nextKeys = new Set(next.map((a) => a.key));
  return {
    raised: next.filter((a) => !prevKeys.has(a.key)),
    cleared: prev.filter((a) => !nextKeys.has(a.key)),
  };
}

module.exports = { evaluateAlerts, alertDelta };
