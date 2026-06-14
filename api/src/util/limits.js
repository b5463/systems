'use strict';

// Pure mapping from DEFAULT_CONTAINER_* env (with optional per-system override)
// to a Docker HostConfig fragment. Extracted so it can be unit-tested without
// pulling in dockerode.

function containerLimits(opts = {}, env = process.env) {
  const memMb = Number(opts.memoryMb || env.DEFAULT_CONTAINER_MEMORY_MB) || 512;
  const cpu = Number(opts.cpuLimit || env.DEFAULT_CONTAINER_CPU_LIMIT) || 0.5;
  const pids = Number(opts.pidsLimit || env.DEFAULT_CONTAINER_PIDS_LIMIT) || 256;
  const restart = opts.restartPolicy || env.DEFAULT_CONTAINER_RESTART_POLICY || 'unless-stopped';
  const logMaxSize = opts.logMaxSize || env.DEFAULT_CONTAINER_LOG_MAX_SIZE || '10m';
  const logMaxFile = String(opts.logMaxFile || env.DEFAULT_CONTAINER_LOG_MAX_FILE || '3');
  const period = 100000;

  return {
    Memory: Math.round(memMb) * 1024 * 1024,
    CpuPeriod: period,
    CpuQuota: Math.max(1000, Math.round(cpu * period)),
    PidsLimit: pids,
    RestartPolicy: restart === 'on-failure'
      ? { Name: 'on-failure', MaximumRetryCount: 5 }
      : { Name: restart },
    LogConfig: { Type: 'json-file', Config: { 'max-size': logMaxSize, 'max-file': logMaxFile } },
  };
}

module.exports = { containerLimits };
