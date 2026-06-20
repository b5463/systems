'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateAlerts, alertDelta } = require('../src/util/alerts');

const healthy = {
  disk: { status: 'measured', usedPct: 40 },
  backup: { status: 'ok', ageHours: 2 },
  docker: { status: 'connected' },
  postgres: { status: 'host_validation' },
};

test('a healthy snapshot raises no alerts', () => {
  assert.deepEqual(evaluateAlerts(healthy), []);
});

test('disk warns at 75% and is critical at 90%', () => {
  const warn = evaluateAlerts({ ...healthy, disk: { status: 'measured', usedPct: 80 } });
  assert.equal(warn.find((a) => a.key === 'disk').severity, 'warning');
  const crit = evaluateAlerts({ ...healthy, disk: { status: 'measured', usedPct: 92 } });
  assert.equal(crit.find((a) => a.key === 'disk').severity, 'critical');
});

test('unmeasured disk is never alerted', () => {
  const r = evaluateAlerts({ ...healthy, disk: { status: 'not_measured', usedPct: null } });
  assert.equal(r.find((a) => a.key === 'disk'), undefined);
});

test('backup alerts on none and on overdue', () => {
  assert.equal(evaluateAlerts({ ...healthy, backup: { status: 'none' } }).find((a) => a.key === 'backup').message, 'No backups yet');
  const overdue = evaluateAlerts({ ...healthy, backup: { status: 'ok', ageHours: 200 } });
  assert.match(overdue.find((a) => a.key === 'backup').message, /200h ago/);
});

test('docker unavailable is critical; postgres unavailable is a warning', () => {
  const r = evaluateAlerts({ ...healthy, docker: { status: 'unavailable' }, postgres: { status: 'unavailable' } });
  assert.equal(r.find((a) => a.key === 'docker').severity, 'critical');
  assert.equal(r.find((a) => a.key === 'postgres').severity, 'warning');
});

test('custom backup-overdue threshold is honoured', () => {
  const r = evaluateAlerts({ ...healthy, backup: { status: 'ok', ageHours: 30 } }, { backupOverdueHours: 24 });
  assert.ok(r.find((a) => a.key === 'backup'));
});

test('alertDelta reports newly raised and cleared by key', () => {
  const prev = [{ key: 'disk', severity: 'warning', message: 'x' }];
  const next = [{ key: 'docker', severity: 'critical', message: 'y' }];
  const d = alertDelta(prev, next);
  assert.deepEqual(d.raised.map((a) => a.key), ['docker']);
  assert.deepEqual(d.cleared.map((a) => a.key), ['disk']);
});

test('resource pressure and health failures use configured thresholds', () => {
  const alerts = evaluateAlerts({
    ...healthy,
    systems: [
      { slug: 'busy', memoryPercent: 98.2, cpuPercent: 81, healthFailures: 4 },
      { slug: 'quiet', memoryPercent: 20, cpuPercent: 10, healthFailures: 0 },
    ],
  }, { memoryPercent: 95, cpuPercent: 80, healthFailures: 4 });

  assert.equal(alerts.find((a) => a.key === 'system:busy:memory').severity, 'critical');
  assert.equal(alerts.find((a) => a.key === 'system:busy:cpu').severity, 'warning');
  assert.equal(alerts.find((a) => a.key === 'system:busy:health').severity, 'critical');
  assert.equal(alerts.some((a) => a.key.startsWith('system:quiet:')), false);
});
