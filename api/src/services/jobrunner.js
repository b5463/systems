'use strict';

// V4 in-process job runner — DISABLED BY DEFAULT (ENABLE_V4_JOBS).
//
// Phase 0 shipped the skeleton (atomic claim, retry/backoff, dead-letter,
// stale-lock release). Phase 1 adds per-type concurrency: job families (the
// first dot segment of job_type) run in parallel up to their roadmap caps
// (build 1, stripe 3, email 10, analytics 5, webhook 20), claims skip
// saturated families, completed jobs are purged after 7 days, and a growing
// dead-letter queue raises an operator alert.

const os = require('os');
const { jobRepo } = require('../repo');
const { typePrefix, concurrencyFor } = require('../util/jobs');

const handlers = new Map();

let pollTimer = null;
let staleTimer = null;
let purgeTimer = null;
let ticking = false;
let lastDeadAlertAt = 0;

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const DEAD_ALERT_THRESHOLD = 10;

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

// Drain due jobs with per-type concurrency. maxJobs bounds one tick so a deep
// queue cannot run unbounded between polls; the global cap bounds simultaneous
// in-flight work regardless of how generous the per-type caps are.
async function tick(maxJobs = 25) {
  if (ticking) return { processed: 0 };
  ticking = true;
  const globalCap = Number(process.env.JOBS_GLOBAL_CONCURRENCY) || 10;
  const active = new Map();   // type prefix → in-flight count
  const inflight = new Set(); // promises of running jobs
  let processed = 0;
  try {
    while (processed < maxJobs) {
      if (inflight.size >= globalCap) {
        await Promise.race(inflight);
        continue;
      }
      const saturated = [...active.entries()]
        .filter(([prefix, count]) => count >= concurrencyFor(prefix))
        .map(([prefix]) => prefix);
      const job = await jobRepo.claimNext(WORKER_ID, saturated);
      if (!job) {
        if (!inflight.size) break;       // queue drained
        await Promise.race(inflight);    // a slot may free a saturated family
        continue;
      }
      const prefix = typePrefix(job.job_type);
      active.set(prefix, (active.get(prefix) || 0) + 1);
      processed += 1;
      const p = runOne(job)
        .catch(() => {})                 // runOne records failures itself
        .finally(() => {
          active.set(prefix, active.get(prefix) - 1);
          inflight.delete(p);
        });
      inflight.add(p);
    }
    await Promise.all(inflight);
  } finally {
    ticking = false;
  }
  return { processed };
}

async function checkDeadLetter() {
  const counts = await jobRepo.counts();
  if (counts.dead > DEAD_ALERT_THRESHOLD && Date.now() - lastDeadAlertAt > 60 * 60_000) {
    lastDeadAlertAt = Date.now();
    console.warn(`[jobs] ALERT: ${counts.dead} dead-lettered job(s) need operator investigation`);
    try {
      const notify = require('./notify');
      notify.send({ kind: 'jobs_dead_letter', detail: `${counts.dead} dead-lettered jobs` }).catch(() => {});
    } catch { /* notifications are optional */ }
  }
  return counts;
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
    checkDeadLetter().catch(() => {});
  }, 60_000);
  if (staleTimer.unref) staleTimer.unref();

  // Completed jobs are kept 7 days (roadmap retention), then purged daily.
  purgeTimer = setInterval(() => {
    jobRepo.purgeCompleted(7)
      .then((n) => { if (n) console.log(`[jobs] purged ${n} completed job(s) older than 7d`); })
      .catch((e) => console.error('[jobs] purge failed:', e.message));
  }, 24 * 3.6e6);
  if (purgeTimer.unref) purgeTimer.unref();

  console.log(`[jobs] in-process runner started (poll ${pollMs}ms, worker ${WORKER_ID})`);
  return true;
}

function stop() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
  if (purgeTimer) { clearInterval(purgeTimer); purgeTimer = null; }
}

module.exports = { register, start, stop, tick, runOne, checkDeadLetter, WORKER_ID };
