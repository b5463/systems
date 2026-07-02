'use strict';

const { prisma } = require('./client');
const { afterFailure } = require('../util/jobs');

// V4 Phase 0 job queue repository. Claiming is a single atomic UPDATE with
// FOR UPDATE SKIP LOCKED so concurrent runners (or a future multi-process
// setup) can never double-claim a job. Attempts are counted at claim time —
// an attempt that crashes mid-flight is still an attempt.

async function enqueue({ jobType, payload = null, maxAttempts = 3, runAt = null }) {
  return prisma.job.create({
    data: {
      jobType,
      payload: payload == null ? null : JSON.stringify(payload),
      maxAttempts,
      ...(runAt ? { nextRunAt: runAt } : {}),
    },
  });
}

async function claimNext(lockedBy) {
  const rows = await prisma.$queryRaw`
    UPDATE jobs SET
      status = 'running',
      attempts = attempts + 1,
      locked_at = CURRENT_TIMESTAMP,
      locked_by = ${lockedBy},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND next_run_at <= CURRENT_TIMESTAMP
      ORDER BY next_run_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, job_type, payload, status, attempts, max_attempts`;
  return rows[0] || null;
}

async function complete(id) {
  return prisma.job.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

async function fail(id, errorMessage) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return null;
  const next = afterFailure({ attempts: job.attempts, max_attempts: job.maxAttempts });
  return prisma.job.update({
    where: { id },
    data: {
      status: next.status,
      lastError: String(errorMessage || 'unknown error').slice(0, 2000),
      lockedAt: null,
      lockedBy: null,
      ...(next.status === 'pending'
        ? { nextRunAt: new Date(Date.now() + next.retryInMs) }
        : {}),
    },
  });
}

// Unlock jobs whose runner died mid-attempt: 'running' rows locked longer than
// maxLockMs go back to 'pending' (or 'dead' on their next failure via the
// normal attempts accounting). Returns the number of released jobs.
async function releaseStale(maxLockMs) {
  const cutoff = new Date(Date.now() - maxLockMs);
  const { count } = await prisma.job.updateMany({
    where: { status: 'running', lockedAt: { lt: cutoff } },
    data: { status: 'pending', lockedAt: null, lockedBy: null },
  });
  return count;
}

// Purge terminal jobs older than the retention window (roadmap: 7 days for
// completed). Dead jobs are kept — they require operator investigation.
async function purgeCompleted(olderThanDays = 7) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 3.6e6);
  const { count } = await prisma.job.deleteMany({
    where: { status: 'completed', completedAt: { lt: cutoff } },
  });
  return count;
}

async function counts() {
  const rows = await prisma.job.groupBy({ by: ['status'], _count: { _all: true } });
  const out = { pending: 0, running: 0, completed: 0, dead: 0 };
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

async function findById(id) {
  return prisma.job.findUnique({ where: { id } });
}

module.exports = { enqueue, claimNext, complete, fail, releaseStale, purgeCompleted, counts, findById };
