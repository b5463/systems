'use strict';

const { adminRepo } = require('../repo');

const DEFINITIONS = Object.freeze({
  releaseRetention: { type: 'integer', min: 1, max: 50, default: 3, env: 'RELEASE_RETENTION_DEFAULT', label: 'Release retention' },
  statsRetentionHours: { type: 'integer', min: 1, max: 720, default: 168, env: 'STATS_RETENTION_HOURS', label: 'Metrics retention (hours)' },
  backupRetention: { type: 'integer', min: 1, max: 365, default: 14, env: 'BACKUP_RETENTION', label: 'Backup retention' },
  backupIntervalHours: { type: 'number', min: 1, max: 168, default: 24, env: 'BACKUP_INTERVAL_HOURS', label: 'Backup interval (hours)' },
  backupOverdueHours: { type: 'number', min: 1, max: 720, default: 168, env: 'BACKUP_OVERDUE_HOURS', label: 'Backup overdue threshold (hours)' },
  alertMemoryPercent: { type: 'number', min: 50, max: 100, default: 90, env: 'ALERT_MEMORY_PERCENT', label: 'Memory alert threshold (%)' },
  alertCpuPercent: { type: 'number', min: 50, max: 100, default: 90, env: 'ALERT_CPU_PERCENT', label: 'CPU alert threshold (%)' },
  alertHealthFailures: { type: 'integer', min: 1, max: 20, default: 3, env: 'ALERT_HEALTH_FAILURES', label: 'Health failures before alert' },
  notificationFormat: { type: 'enum', values: ['generic', 'slack', 'discord', 'email'], default: 'generic', env: 'NOTIFY_FORMAT', label: 'Notification format' },
});

function coerce(def, value) {
  if (def.type === 'enum') {
    const v = String(value || '').trim().toLowerCase();
    if (!def.values.includes(v)) throw new Error(`must be one of: ${def.values.join(', ')}`);
    return v;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('must be a number');
  if (def.type === 'integer' && !Number.isInteger(n)) throw new Error('must be a whole number');
  if (n < def.min || n > def.max) throw new Error(`must be between ${def.min} and ${def.max}`);
  return n;
}

function envValue(key, env = process.env) {
  const def = DEFINITIONS[key];
  const raw = def.env && env[def.env];
  if (raw == null || raw === '') return def.default;
  try { return coerce(def, raw); } catch { return def.default; }
}

async function storedRow(key) {
  return adminRepo.getSetting(key);
}

async function getSetting(key, env = process.env) {
  const def = DEFINITIONS[key];
  if (!def) throw new Error(`Unknown setting: ${key}`);
  const row = await storedRow(key);
  if (!row) return envValue(key, env);
  try { return coerce(def, JSON.parse(row.value)); } catch { return envValue(key, env); }
}

async function listSettings(env = process.env) {
  const results = [];
  for (const [key, def] of Object.entries(DEFINITIONS)) {
    const row = await storedRow(key);
    results.push({
      key,
      label: def.label,
      type: def.type,
      min: def.min,
      max: def.max,
      values: def.values,
      value: await getSetting(key, env),
      source: row ? 'database' : (def.env && env[def.env] != null ? 'environment' : 'default'),
      updatedAt: row ? row.updated_at : null,
    });
  }
  return results;
}

async function updateSettings(changes, userId) {
  const updated = {};
  const batch = {};
  for (const [key, raw] of Object.entries(changes || {})) {
    const def = DEFINITIONS[key];
    if (!def) throw new Error(`Unknown setting: ${key}`);
    if (raw === null) {
      batch[key] = null;
      updated[key] = envValue(key);
    } else {
      const value = coerce(def, raw);
      batch[key] = value;
      updated[key] = value;
    }
  }
  await adminRepo.updateSettingsBatch(batch, userId);
  return updated;
}

module.exports = { DEFINITIONS, getSetting, listSettings, updateSettings, coerce };
