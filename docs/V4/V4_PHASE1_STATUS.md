# SYSTEMS. V4 — Phase 1 status (PostgreSQL foundation hardening)

**Branch:** `claude/v4-roadmap-alexes-tasks-yhg4qi`
**Scope:** Phase 1 engineering tasks from `V4_DEVELOPER_ALLOCATION.md` (revised for the Prisma/PostgreSQL baseline).
**Updated:** 2026-07-02

---

## Implemented in this changeset

| Task | Where |
|---|---|
| Foundational tables as a Prisma migration | `20260702130000_v4_phase1_foundational`: `organisations`, `admin_users`, `admin_sessions`, `audit_log_v4` — UUID keys, FKs, and every composite index in the same migration (roadmap rule) |
| Repository facades | `api/src/repo/organisations.js` (idempotent default-org seed), `adminusers.js`, `adminsessions.js`, `auditv4.js` — exported as `orgRepo`, `adminUserRepo`, `adminSessionRepo`, `auditV4Repo` |
| V4 audit chain | `audit_log_v4` is hash-chained like the legacy log (own canonical incl. organisation/entity fields, advisory lock key 3, `request_id` as out-of-chain metadata); tamper detection verified by test |
| V4 admin session policy | Raw tokens `crypto.randomBytes(32)`, only the sha256 stored; per-admin cap (default 5, `MAX_SESSIONS_PER_ADMIN`) revokes the oldest |
| Per-type job concurrency | Families by first dot segment: build 1, stripe 3, email 10, analytics 5, webhook 20, default 5 (`util/jobs.js`); claims skip saturated families (`split_part` exclusion with `FOR UPDATE SKIP LOCKED`); runner executes families in parallel under a global cap (`JOBS_GLOBAL_CONCURRENCY`, default 10) |
| Dead-letter alerting + retention | Alert (log + optional notify webhook) when dead-lettered jobs exceed 10, throttled hourly; completed jobs purged after 7 days |
| Legacy session hardening | Login `jti` now `crypto.randomBytes(32).toString('hex')` (was UUIDv4); fresh id per login (fixation prevention, pre-existing); max 5 concurrent sessions per user — 6th login revokes the oldest (`MAX_SESSIONS_PER_USER`) |
| Backup schema marker | Every backup manifest records `schema_version` (last applied Prisma migration) + `migrations_applied`, per the cross-phase rollback rule (roadmap §2.3); `pg_dump` inherently includes `_prisma_migrations`, `jobs`, settings and audit tables |
| Verify script | `api/scripts/verify-postgres-migration.js` — connection, migration state (pending/unknown), core-table presence + row counts, both audit chains; non-zero exit on failure |
| Windows wrappers | `scripts/migrate-v4-windows.ps1` (migrate deploy → legacy data copy → verify), `scripts/verify-v4-windows.ps1` |
| PgBouncer wiring | Opt-in compose profile `pgbouncer` (edoburu/pgbouncer: transaction pooling, 20 server connections, pool 5, reserve 1, idle 300s, port 6432); `DATABASE_URL` passthrough added to the API service; env spec in `.env.example` |
| Tests | `api/test/v4-phase1.test.js` (9 tests): concurrency policy, v4 chain verify + tamper, org/admin/session repos, claim exclusion, per-type runner cap, login session cap + 256-bit ids |

## Still open (needs host/infra, not code)

- **PgBouncer deployed and validated on the production host** — the compose
  profile and env spec are ready; pool-exhaustion behaviour (503, never a
  hang) must be observed against a real pooler before ticking the checklist.
- **S3 backup destination + clean-host restore drill** — V3 object-storage
  upload (`ENABLE_OBJECT_STORAGE_BACKUPS`, `S3_*`) already ships backups to
  S3-compatible storage; the Phase 1 exit needs the restore drill from S3 on
  a host with no local files, plus encryption-at-rest decision
  (`BACKUP_ENCRYPTION_KEY`) before Phase 9's full drill.
- **Legacy-install migration rehearsal** — `migrate-sqlite-to-postgres.js`
  predates V4; run it against a real legacy SQLite snapshot and follow with
  `verify-postgres-migration.js` (repeatably) before relying on it.

## Exit-gate checklist (current state)

- [x] All tests pass against PostgreSQL (full suite + 9 Phase 1 tests)
- [x] V4 foundational tables exist with composite indexes (zero Prisma drift)
- [x] Backup manifest carries Prisma migration state
- [x] No dashboard behaviour changed
- [ ] PgBouncer validated on a real host (compose profile ready)
- [ ] S3 restore drill on a clean host
- [ ] Legacy-install migration rehearsed on a snapshot
