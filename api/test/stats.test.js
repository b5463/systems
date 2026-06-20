'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { nonNegativeMetric, cpuPercentFromSnapshot } = require('../src/util/stats');

test('CPU percentage is calculated from monotonic Docker counters', () => {
  const value = cpuPercentFromSnapshot({
    cpu_stats: {
      online_cpus: 2,
      cpu_usage: { total_usage: 1100 },
      system_cpu_usage: 5000,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1000 },
      system_cpu_usage: 4000,
    },
  });
  assert.equal(value, 20);
});

test('CPU counter resets and invalid samples clamp to zero', () => {
  assert.equal(cpuPercentFromSnapshot({
    cpu_stats: { online_cpus: 2, cpu_usage: { total_usage: 50 }, system_cpu_usage: 5000 },
    precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 4000 },
  }), 0);
  assert.equal(cpuPercentFromSnapshot({}), 0);
  assert.equal(nonNegativeMetric(-1.4), 0);
  assert.equal(nonNegativeMetric(Number.NaN), 0);
});
