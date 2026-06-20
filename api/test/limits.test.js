'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { containerLimits, projectContainerOptions } = require('../src/util/limits');

test('defaults map correctly', () => {
  const l = containerLimits({}, {});
  assert.equal(l.Memory, 512 * 1024 * 1024);
  assert.equal(l.CpuPeriod, 100000);
  assert.equal(l.CpuQuota, 50000); // 0.5 * 100000
  assert.equal(l.PidsLimit, 256);
  assert.deepEqual(l.RestartPolicy, { Name: 'unless-stopped' });
  assert.deepEqual(l.LogConfig.Config, { 'max-size': '10m', 'max-file': '3' });
});

test('env values are honoured', () => {
  const env = {
    DEFAULT_CONTAINER_MEMORY_MB: '1024',
    DEFAULT_CONTAINER_CPU_LIMIT: '1',
    DEFAULT_CONTAINER_PIDS_LIMIT: '512',
    DEFAULT_CONTAINER_RESTART_POLICY: 'on-failure',
    DEFAULT_CONTAINER_LOG_MAX_SIZE: '20m',
    DEFAULT_CONTAINER_LOG_MAX_FILE: '5',
  };
  const l = containerLimits({}, env);
  assert.equal(l.Memory, 1024 * 1024 * 1024);
  assert.equal(l.CpuQuota, 100000);
  assert.equal(l.PidsLimit, 512);
  assert.deepEqual(l.RestartPolicy, { Name: 'on-failure', MaximumRetryCount: 5 });
  assert.deepEqual(l.LogConfig.Config, { 'max-size': '20m', 'max-file': '5' });
});

test('per-system overrides win over env', () => {
  const l = containerLimits({ memoryMb: 256, cpuLimit: 0.25 }, { DEFAULT_CONTAINER_MEMORY_MB: '512' });
  assert.equal(l.Memory, 256 * 1024 * 1024);
  assert.equal(l.CpuQuota, 25000);
});

test('project rows map persisted overrides without clobbering runtime options', () => {
  const opts = projectContainerOptions({
    limit_memory_mb: 768,
    limit_cpu: 1.5,
    limit_pids: 300,
    limit_restart_policy: 'on-failure',
    limit_log_max_size: '25m',
    limit_log_max_file: 4,
  }, { containerPort: 8080 });

  assert.deepEqual(opts, {
    containerPort: 8080,
    memoryMb: 768,
    cpuLimit: 1.5,
    pidsLimit: 300,
    restartPolicy: 'on-failure',
    logMaxSize: '25m',
    logMaxFile: 4,
  });
});