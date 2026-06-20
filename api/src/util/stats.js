'use strict';

function nonNegativeMetric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function cpuPercentFromSnapshot(stats = {}) {
  const current = stats.cpu_stats || {};
  const previous = stats.precpu_stats || {};
  const currentUsage = current.cpu_usage || {};
  const previousUsage = previous.cpu_usage || {};

  const cpuDelta = Number(currentUsage.total_usage) - Number(previousUsage.total_usage);
  const systemDelta = Number(current.system_cpu_usage) - Number(previous.system_cpu_usage);
  if (!Number.isFinite(cpuDelta) || !Number.isFinite(systemDelta) || cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }

  const perCpu = Array.isArray(currentUsage.percpu_usage) ? currentUsage.percpu_usage.length : 0;
  const cpuCount = Math.max(1, Number(current.online_cpus) || perCpu || 1);
  const percent = (cpuDelta / systemDelta) * cpuCount * 100;
  return Math.round(nonNegativeMetric(percent) * 100) / 100;
}

module.exports = { nonNegativeMetric, cpuPercentFromSnapshot };
