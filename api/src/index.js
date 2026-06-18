'use strict';

const { buildApp } = require('./app');
const { initDefaultUsers, pruneAudit } = require('./db');
const { ensureIsolatedNetwork, isDockerUnavailableError } = require('./services/docker');
const reconcile = require('./services/reconcile');
const backup = require('./services/backup');

async function main() {
  const fastify = await buildApp({ fastify: { logger: true } });

  // Initialize default users from ADMIN_USERS env var
  await initDefaultUsers();

  // Ensure the isolated Docker network exists before accepting traffic. In local
  // dev the API may run without Docker Desktop/WSL active; keep read-only API
  // surfaces available and let Docker-backed actions fail at request time.
  try {
    await ensureIsolatedNetwork();
  } catch (err) {
    if (!isDockerUnavailableError(err)) throw err;
    fastify.log.warn(`Docker unavailable at startup (${err.code}); deploy/container actions are disabled until Docker is available.`);
  }

  // Reconcile DB status against real container state on boot, then on an
  // interval, so crashes/reboots don't leave stale "running" rows.
  reconcile.start();

  // Periodic backups (no-op unless ENABLE_BACKUP_SCHEDULER=true).
  backup.start();

  // Audit-log retention: prune on boot and daily when AUDIT_RETENTION_DAYS > 0
  // (0/unset keeps everything). The hash chain stays verifiable from the first
  // retained row forward.
  const auditDays = Number(process.env.AUDIT_RETENTION_DAYS) || 0;
  if (auditDays > 0) {
    try {
      const { pruned } = pruneAudit(auditDays);
      if (pruned) fastify.log.info(`Pruned ${pruned} audit entries older than ${auditDays}d`);
    } catch (e) { fastify.log.warn(`Audit prune failed: ${e.message}`); }
    const auditTimer = setInterval(() => {
      try { pruneAudit(auditDays); } catch { /* best-effort */ }
    }, 24 * 3.6e6);
    if (auditTimer.unref) auditTimer.unref();
  }

  await fastify.listen({ port: 3000, host: '0.0.0.0' });
  fastify.log.info('SYSTEMS. deployment engine API running on 0.0.0.0:3000');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
