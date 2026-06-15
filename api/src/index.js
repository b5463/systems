'use strict';

const { buildApp } = require('./app');
const { initDefaultUsers } = require('./db');
const { ensureIsolatedNetwork } = require('./services/docker');
const reconcile = require('./services/reconcile');
const backup = require('./services/backup');

async function main() {
  const fastify = await buildApp({ fastify: { logger: true } });

  // Initialize default users from ADMIN_USERS env var
  await initDefaultUsers();

  // Ensure the isolated Docker network exists before accepting traffic
  await ensureIsolatedNetwork();

  // Reconcile DB status against real container state on boot, then on an
  // interval, so crashes/reboots don't leave stale "running" rows.
  reconcile.start();

  // Periodic backups (no-op unless ENABLE_BACKUP_SCHEDULER=true).
  backup.start();

  await fastify.listen({ port: 3000, host: '0.0.0.0' });
  fastify.log.info('SYSTEMS. deployment engine API running on 0.0.0.0:3000');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
