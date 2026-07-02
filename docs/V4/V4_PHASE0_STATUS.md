# SYSTEMS. V4 — Phase 0 status (Alex / Infrastructure)

**Branch:** `claude/v4-roadmap-alexes-tasks-yhg4qi`
**Scope:** Alex's Phase 0 tasks from `V4_DEVELOPER_ALLOCATION.md` ("Stabilise current repository").
**Updated:** 2026-07-02

---

## Implemented in this changeset

| Roadmap task | Where |
|---|---|
| Add `PATCH` to Fastify CORS | `api/src/app.js` |
| Global request ID generation + logs | `api/src/app.js` (`genReqId` honours a safe inbound `X-Request-Id`, else UUID; echoed on every response; carried in AsyncLocalStorage via `api/src/util/requestcontext.js`; Fastify logs already include `reqId`) |
| Request ID on audit entries | `audit_log.request_id` column (migration `20260702090000`); `appendAudit` reads the current request ID from AsyncLocalStorage automatically — no call-site changes. Deliberately **not** part of the hash-chain canonical fields, so existing chains stay verifiable |
| Stricter JSON payload-size defaults | `API_JSON_BODY_LIMIT_BYTES` (default 512 KiB, down from Fastify's 1 MiB); multipart uploads keep their own caps |
| Feature flag helper for V4 gates | `api/src/util/flags.js` — all eight `ENABLE_V4_*` gates plus `ENABLE_V4_JOBS`, all OFF by default |
| `jobs` table | Migration `20260702090000`: status/attempts/max_attempts/next_run_at (retry+backoff), locked_at/locked_by (lock), last_error, dead-letter status; composite indexes in the same migration |
| In-process job runner (disabled by default) | `api/src/services/jobrunner.js` — polling loop behind `ENABLE_V4_JOBS`, atomic claim (`FOR UPDATE SKIP LOCKED`), retry backoff 30s → 5m → 30m, dead-letter after `max_attempts`, stale-lock release. `api/src/repo/jobs.js` + pure policy in `api/src/util/jobs.js` |
| Admin API cache headers | `Cache-Control: no-store` on every API response (`onSend` hook) |
| Confirm host-protection invariants | `api/test/hostprotection.test.js` pins container limits, build caps + concurrency gate, upload caps, disk admission margin |
| Tests: CORS PATCH, feature flags, job table, request IDs | `api/test/v4-phase0.test.js` (21 tests; DB-backed ones gate-skip without `DATABASE_URL`, same as the existing suites) |

## Adaptations from the roadmap text (and why)

The roadmap was written against the older SQLite baseline. The repository has
since moved its control plane to **PostgreSQL via Prisma**
(`docs/POSTGRES_PRISMA_MIGRATION.md`), which changes two Phase 0 tasks:

1. **"Add `schema_migrations` table + migration runner skeleton"** — Prisma
   Migrate already provides exactly this: the `_prisma_migrations` table is the
   ledger (name, checksum, applied_at), ordering is deterministic, checksums
   are verified, and CI applies migrations with `prisma migrate deploy`.
   Introducing a second, hand-rolled runner writing to the same database would
   add a competing source of truth for schema state. V4 schema (starting with
   `jobs`) therefore ships as hand-written SQL inside Prisma migrations. If
   Phase 1 surfaces a need Prisma cannot express (e.g. data backfills with
   app-level encryption), a scripted migration can be added inside the Prisma
   migration flow at that point.
2. **"Stop using silent `ALTER TABLE` blocks" / "test-only migration reset"** —
   already true for the Prisma control plane: `api/src/db/index.js` (the old
   SQLite bootstrap with `try {} catch {}` ALTERs) is legacy and unreferenced
   by `src/`; new schema goes through migrations only. Test reset lives in
   `api/test/_dbtest.js` (`resetDb()`), now including the `jobs` table.

Tomas's Phase 0 items (schema/features endpoints, error response shape,
pagination envelope, SQLite-in-production warning, job dashboard placeholder)
are **not** part of this changeset.

## Open pre-flight decisions (human, non-engineering — blockers if unresolved)

Per the roadmap, these must be locked before the Phase 0 exit gate:

1. **Email provider** (Alex to propose, management to confirm): SendGrid / SES /
   Mailgun / SMTP relay. Needs `SEND_EMAIL_PROVIDER`, `SEND_EMAIL_FROM`,
   `SEND_EMAIL_API_KEY`, `SEND_EMAIL_REPLY_TO` in the staging env spec and a
   startup smoke test on staging. Blocks Phase 7 fulfilment and Phase 8 intake.
2. **Monitoring/alerting stack + on-call** (Alex + Acronym management):
   Prometheus+Grafana vs. Datadog; alert channel; thresholds from the roadmap;
   on-call named. Blocks the Phase 1 exit gate.
3. **Staging environment allocation** (Alex): separate PostgreSQL, Stripe test
   account, Caddy, `staging.systems.acronym.sk` + `staging.acronym.sk`.
4. **Slovak/EU legal engagement** (Acronym management): VAT/Stripe Tax,
   14-day withdrawal wording, GDPR erasure workflow, checkout consents.
   Must start by Phase 5 at the latest; written sign-off gates Phase 6 go-live.

## Phase 0 exit-gate checklist (current state)

- [x] All existing tests pass (161 pass / 0 fail, incl. new Phase 0 suites)
- [x] New Phase 0 tests pass
- [x] Current dashboard and deploy flow untouched by this changeset (no route or service behaviour changed apart from headers/CORS/body limit)
- [x] Backup script unaffected
- [ ] Staging environment allocated and deploying
- [ ] Email provider chosen and smoke-tested
- [ ] Monitoring stack chosen; thresholds defined; on-call assigned
- [ ] Tomas's Phase 0 items (schema/features endpoints, error shape, pagination, SQLite warning, job UI placeholder)
