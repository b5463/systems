'use strict';

// Docker build limits are separate from deployed-container limits. Builds run
// untrusted dependency installers and compilers, so they need their own,
// generally larger, ceiling.
function buildLimits(env = process.env) {
  const memoryMb = Number(env.BUILD_MEMORY_MB) || 1024;
  const cpu = Number(env.BUILD_CPU_LIMIT) || 1;
  const cpuperiod = 100000;
  const memory = Math.max(128, Math.round(memoryMb)) * 1024 * 1024;

  return {
    memory,
    memswap: memory,
    cpuperiod,
    cpuquota: Math.max(1000, Math.round(cpu * cpuperiod)),
  };
}

class BuildGate {
  constructor(limit = () => Number(process.env.MAX_CONCURRENT_BUILDS) || 1) {
    this.limit = limit;
    this.active = new Set();
  }

  tryAcquire(key) {
    if (this.active.has(key)) return false;
    const cap = Math.max(1, Math.floor(Number(this.limit()) || 1));
    if (this.active.size >= cap) return false;
    this.active.add(key);
    return true;
  }

  release(key) {
    this.active.delete(key);
  }

  count() {
    return this.active.size;
  }
}

module.exports = { buildLimits, BuildGate };