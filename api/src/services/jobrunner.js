'use strict';

// V4 Phase 0 in-process job runner — DISABLED BY DEFAULT (ENABLE_V4_JOBS).
//
// Skeleton scope, per the roadmap: single-worker polling loop, atomic claim
// via the jobs repo, retry/backoff and dead-lettering handled by the repo, and
// stale-lock release so a crashed process cannot strand 'running' jobs
// forever. Per-type concurrency limits and dead-letter alerting are Phase 1.

const os = require('os');
const { jobRepo } = require('../repo');

const handlers = new Map();

let pollTimer = null;
let staleTimer = null;
let ticking = false;

const WORKER_ID = `${os.hostname()}:${process.pid}`;

function register(jobType, handler) {
  if (typeof handler !== 'function') throw new Error(`Handler for ${jobType} must be a function`);
  handlers.set(jobType, handler);
}

async function runOne(job) {
  const handler = handlers.get(job.job_type);
  if (!handler) {
    await jobRepo.fail(job.id, `No handler registered for job type: ${job.job_type}`);
    return { id: job.id, ok: false, reason: 'no_handler' };
  }
  try {
    const payload = job.payload ? JSON.parse(job.payload) : null;
    await handler(payload, job);
    await jobRepo.complete(job.id);
    return { id: job.id, ok: true };
  } catch (err) {
    await jobRepo.fail(job.id, err && err.message);
    return { id: job.id, ok: false, reason: err && err.message };
  }
}

// Drain due jobs sequentially. maxJobs bounds one tick so a deep queue can't
// starve the event loop between polls.
async function tick(maxJobs = 25) {
  if (ticking) return { processed: 0 };
  ticking = true;
  let processed = 0;
  try {
    while (processed < maxJobs) {
      const job = await jobRepo.claimNext(WORKER_ID);
      if (!job) break;
      await runOne(job);
      processed += 1;
    }
  } finally {
    ticking = false;
  }
  return { processed };
}

function start() {
  const { features } = require('../util/flags');
  if (!features().v4Jobs) return false;
  if (pollTimer) return true;

  const pollMs = Number(process.env.JOBS_POLL_INTERVAL_MS) || 5000;
  const lockTimeoutMs = Number(process.env.JOBS_LOCK_TIMEOUT_MS) || 5 * 60_000;

  pollTimer = setInterval(() => {
    tick().catch((e) => console.error('[jobs] tick failed:', e.message));
  }, pollMs);
  if (pollTimer.unref) pollTimer.unref();

  staleTimer = setInterval(() => {
    jobRepo.releaseStale(lockTimeoutMs)
      .then((n) => { if (n) console.warn(`[jobs] released ${n} stale lock(s)`); })
      .catch((e) => console.error('[jobs] stale release failed:', e.message));
  }, 60_000);
  if (staleTimer.unref) staleTimer.unref();

  console.log(`[jobs] in-process runner started (poll ${pollMs}ms, worker ${WORKER_ID})`);
  return true;
}

function stop() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
}

module.exports = { register, start, stop, tick, runOne, WORKER_ID };
