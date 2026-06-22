'use strict';

const { buildApp } = require('./app');
const { prisma } = require('./repo');
const { auditRepo } = require('./repo');
const { ensureIsolatedNetwork, isDockerUnavailableError } = require('./services/docker');
const reconcile = require('./services/reconcile');
const backup = require('./services/backup');
const bcrypt = require('bcrypt');

async function initDefaultUsers() {
  const adminUsers = process.env.ADMIN_USERS;
  if (!adminUsers) return;

  const { userRepo } = require('./repo');
  const pairs = adminUsers.split(',').map(s => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) {
      console.warn(`[db] Skipping malformed ADMIN_USERS entry: ${pair}`);
      continue;
    }
    const username = pair.slice(0, colonIdx).trim();
    const password = pair.slice(colonIdx + 1).trim();

    if (!username || !password) {
      console.warn(`[db] Skipping empty username or password in ADMIN_USERS`);
      continue;
    }

    const existing = await userRepo.findByUsername(username);
    if (existing) continue;

    if (password.length < 15) {
      const message = `[db] ADMIN_USERS password for ${username} must be at least 15 characters.`;
      if (process.env.NODE_ENV === 'production') throw new Error(message);
      console.warn(message);
      continue;
    }

    const password_hash = await bcrypt.hash(password, 12);
    await userRepo.createUser(username, password_hash);
    console.log(`[db] Created user: ${username}`);
  }
}

async function main() {
  await prisma.$connect();

  const fastify = await buildApp({ fastify: { logger: true } });

  await initDefaultUsers();

  try {
    await ensureIsolatedNetwork();
  } catch (err) {
    if (!isDockerUnavailableError(err)) throw err;
    fastify.log.warn(`Docker unavailable at startup (${err.code}); deploy/container actions are disabled until Docker is available.`);
  }

  reconcile.start();
  backup.start();

  const auditDays = Number(process.env.AUDIT_RETENTION_DAYS) || 0;
  if (auditDays > 0) {
    try {
      const { pruned } = await auditRepo.pruneAudit(auditDays);
      if (pruned) fastify.log.info(`Pruned ${pruned} audit entries older than ${auditDays}d`);
    } catch (e) { fastify.log.warn(`Audit prune failed: ${e.message}`); }
    const auditTimer = setInterval(() => {
      auditRepo.pruneAudit(auditDays).catch(() => {});
    }, 24 * 3.6e6);
    if (auditTimer.unref) auditTimer.unref();
  }

  const port = Number(process.env.PORT) || 3000;
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`SYSTEMS. deployment engine API running on 0.0.0.0:${port}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
