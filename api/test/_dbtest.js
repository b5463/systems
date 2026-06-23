'use strict';

// Shared setup for the route-level integration tests that need a real database.
// These run against Postgres via Prisma (the control plane's actual backend),
// so they require a DATABASE_URL pointing at a DISPOSABLE test database — every
// run TRUNCATEs all tables. They gate-skip when DATABASE_URL is unset so the
// pure-unit `npm test` stays green locally without a database; CI provisions
// Postgres and sets DATABASE_URL so they actually run.
//
// node --test runs files in parallel, but both DB suites share one database, so
// the test script pins --test-concurrency=1 to serialize them.

const { prisma } = require('../src/repo/client');

const hasDb = !!process.env.DATABASE_URL;

// @@map names from prisma/schema.prisma. CASCADE clears FK-linked rows; RESTART
// IDENTITY keeps autoincrement ids predictable across runs.
const TABLES = 'projects, users, sessions, audit_log, ip_bans, platform_settings, deploy_history, stats_history';

async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES} RESTART IDENTITY CASCADE`);
}

module.exports = { prisma, hasDb, resetDb };
