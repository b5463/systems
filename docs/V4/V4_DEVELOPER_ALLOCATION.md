# SYSTEMS. V4 — Developer Allocation

**Status:** Active  
**Branch:** `claude/v4-roadmap-allocation-jxue3e`  
**Updated:** 2026-06-27  
**Source documents:**

- `docs/V4/V4_PROPOSAL.md` — definitive product and architecture proposal
- `docs/V4/SYSTEMS_V4_IMPLEMENTATION_ROADMAP_FIXED.md` — phased implementation roadmap with exit gates and rollback paths
- `docs/V4/SYSTEMS_V4_TECHNICAL_UPGRADE_PLAN.md` — technical upgrade plan based on current repository
- `docs/V4/V4_IDENTITY_LICENSING_ADDITION.md` — identity, entitlements, licensing and product-user analytics (Phases 7 and 7.5)
- `docs/V4/SYSTEMS_V4_APP_BUILDER_GUIDE_FIXED.md` — app builder integration guide and acceptance levels (Phase 8.5)

Two full stack developers split ownership by domain:

- **Alex — Infrastructure & Commerce**: database, migrations, deploy engine, Stripe, entitlements, security hardening
- **Tomas — Experience & Integration**: dashboard UI, routing, Portfolio CMS, analytics dashboards, public API surfaces

Both devs work on every phase. The split below is by primary ownership — the owner drives the implementation and review; the other contributes as needed.

---

## Pre-flight — non-engineering decisions (resolve before Phase 0 starts)

These have no code to write. Each one is a human decision or an external engagement. If any of the three is still open when the relevant phase begins, that phase is immediately blocked.

| Decision | Owner | Hard deadline | Risk if missed |
|---|---|---|---|
| Choose email provider; set `SEND_EMAIL_PROVIDER`; add staging smoke test | Alex | Before Phase 0 exit gate | Phase 7 fulfilment fires into nothing; all purchases silent-fail |
| Choose monitoring stack; name alerting channel; assign on-call | Alex + Acronym management | Before Phase 1 exit gate | First production incident discovered by customers, not alerts |
| Engage Slovak/EU legal professional for commerce review | Acronym management | Start of Phase 5 at the latest | Phase 6 go-live blocked waiting for 2–4 week legal turnaround |

Legal review must cover: VAT/Stripe Tax treatment, Slovak 14-day withdrawal right wording, GDPR erasure workflow, and all checkout consent disclosures. Engineering and legal review run in parallel during Phase 5. Phase 6 go-live requires written sign-off before live Stripe keys are connected.

---

## Master checklist

Tick a phase when its exit gate passes — not when coding is done.

### Milestone A — Safe Base
- [ ] **Phase 0** — Stabilise current repository
  - [ ] CORS, request IDs, feature flag helper, schema_migrations runner, ALTER TABLE stop, test reset, jobs table, host invariants (Alex)
  - [ ] Schema/features endpoints, error response shape, pagination defaults, SQLite-in-production warning, job UI placeholder, pagination controls (Tomas)
  - [ ] All Phase 0 tests pass; legacy dashboard and deploy flow unaffected
  - [ ] Staging environment allocated and deploying (separate PostgreSQL, Stripe test account, Caddy, staging domains)
  - [ ] Email provider chosen and smoke-tested (SEND_EMAIL_PROVIDER env var set; test email sends on staging startup)
  - [ ] Monitoring stack chosen; alert thresholds defined; on-call rotation assigned
- [ ] **Phase 0.5** — Baseline snapshot and namespace lock
  - [ ] Baseline report committed (tests, lint, routes, schema dump, Caddy inventory, Docker labels, backup dry run, feature flags)
  - [ ] Namespace boundary tests pass
  - [x] Deprecation header helper in place
- [ ] **Phase 1** — PostgreSQL and migration foundation
  - [ ] `postgres.js`, `sqlite-legacy.js`, `repositories/`, `migrate.js`, `migrations/`
  - [ ] `SYSTEMS_DB_ENGINE`, `DATABASE_URL`, `MIGRATIONS_AUTO_RUN` env vars
  - [ ] Migration scripts (JS + PowerShell)
  - [ ] Foundational schema: `schema_migrations`, `organisations`, `admin_users`, `admin_sessions`, `platform_settings`, `audit_log_v4`, `jobs`
  - [ ] Repository facades: users, settings, audit, jobs
  - [ ] Backup/restore extended for PostgreSQL
  - [ ] SQLite legacy mode still passes all tests
  - [ ] PgBouncer deployed as sidecar; all code connects via port 6432
  - [ ] Backup destination set to S3-compatible remote; restore from S3 tested on clean host
  - [ ] Composite indexes defined in same migration as each table
  - [ ] Job runner enforces per-type concurrency limits; dead-letter queue active at 3 failures
  - [ ] Session tokens use crypto.randomBytes(32); session ID rotated on every login

### Milestone B — V4 Operational Core
- [ ] **Phase 2** — Introduce V4 Products/Systems data model
  - [ ] Tables: `products`, `systems`, `system_environments`, `releases`, `domains`, `environment_secrets`, `infrastructure_metrics`, `health_snapshots`, `legacy_project_map`
  - [ ] Migration bridge: projects → systems → environments → releases → domains
  - [ ] Read APIs live; write APIs stable
  - [ ] Legacy `/api/projects/*` compatibility working
  - [ ] Org-scoping enforced in every repository method; CI lint rule rejects unscoped queries
  - [ ] Acceptance test: org A admin cannot read org B systems by ID
  - [ ] Systems page renders V4-backed data (Tomas)
- [ ] **Phase 2.5** — Migration reconciliation checkpoint
  - [ ] `reconcile-v4-migration.js` passes on all test data
  - [ ] Operator dashboard report visible
  - [ ] No orphan containers, no unknown routes, all env secrets decrypt
- [ ] **Phase 3** — Move deploy engine to Systems/Environments
  - [ ] New `/api/systems/:id/environments/:env/deploy|redeploy|rollback|logs|stats` routes live
  - [ ] `deployService` extracted (detect, extract, build, runContainer, verifyHealth, recordRelease, publishRoute, rollback)
  - [ ] Docker labels on all containers
  - [ ] Preview + production environments coexist
  - [ ] Promote flow with health gate works; retain-previous step is a no-op on first-ever deployment
  - [ ] Legacy deploy routes still work
- [ ] **Phase 4** — Domains, routing, access and maintenance
  - [ ] `domains`, `maintenance_windows`, `route_publication_attempts` tables
  - [ ] Domain-driven `renderRoute()` Caddy service
  - [ ] Route publication transaction (write → validate → reload → probe → mark active)
  - [ ] Custom domain verification flow end to end
  - [ ] Domain management, maintenance, and canonical redirect UI (Tomas)
  - [ ] route_status enum (inactive/pending/active/failed/superseded) replaces boolean on system_environments
  - [ ] system_environment_routes junction table deployed; domain↔environment routing is explicit
  - [ ] Route publication is atomic: Caddy reload failure reverts status to 'failed', old route unchanged

### Milestone C — Acronym Public Portfolio
- [ ] **Phase 5** — Portfolio CMS and Acronym public renderer
  - [ ] Portfolio tables: pages, profiles, blocks, snapshots, redirects, forms, submissions, lead_status, media_assets, legal_versions
  - [ ] Draft → preview → publish → immutable snapshot pipeline
  - [ ] Dashboard Portfolio area: homepage, nav, product-page, media, legal, redirects, locales, publish history, rollback (Tomas)
  - [ ] SK/EN locale support with translation completeness indicator
  - [ ] Public catalog API served from precomputed S3 snapshots — never from live PostgreSQL on public reads
  - [ ] Media assets stored by CDN URL only; never embedded in snapshot JSON; max snapshot size 2MB enforced
  - [ ] Concurrent publish lock prevents simultaneous publishes
  - [ ] Snapshot schema versioning: renderer validates renderer_min_version before serving; never silent fallback
  - [ ] `acronym.sk` renderer: pre-rendered, snapshot cache, last-known-good, ETag, no live DB dependency
  - [ ] Renderer stays up during SYSTEMS. API outage

### Milestone D — Paid Products
- [ ] **Phase 6** — Commerce foundation
  - [ ] Tables: `offers`, `customers`, `orders`, `subscriptions`, `payment_webhook_events`, `checkout_disclosures`
  - [ ] Stripe Checkout + Customer Portal integrated
  - [ ] Signed webhook endpoint with idempotency
  - [ ] Manual and complimentary order creation
  - [ ] All 6 subscription states mirrored from Stripe
  - [ ] Reconciliation jobs: checkout_sessions, subscriptions, invoices, orders (no entitlement job until Phase 7)
  - [ ] Soft-delete columns (deleted_at) on customers, accounts, product_users, account_emails, entitlement_grants
  - [ ] GDPR data_subject_requests table and erasure workflow (Stripe deletion + anonymisation + audit)
  - [ ] VAT/Stripe Tax: automatic_tax enabled on all sessions; tax amounts stored per order; legal approval obtained
  - [ ] Subscription cancellation flow built in SYSTEMS. (not delegated to Stripe Portal); Slovak withdrawal rights disclosed
  - [ ] Webhook advisory lock (pg_try_advisory_xact_lock) prevents concurrent duplicate event processing
  - [ ] subscriptions.entitlement_grant_id FK added (NULL until Phase 7); idempotency_key UNIQUE on orders
  - [ ] offers.entitlement_template_version INT column; grace_policy_snapshot JSONB planned for Phase 7
  - [ ] Per-checkout legal/compliance capture (terms, privacy, withdrawal consent, locale, VAT evidence)
  - [ ] Checkout flow and compliance UI (Tomas)
  - [ ] Test-mode Stripe purchase works end to end; success redirect grants no access
- [ ] **Phase 7** — Entitlements, product keys and licensing
  - [ ] Entitlement tables: grants (with nullable account_id), revocations, snapshots, effective_entitlements, licences, activations, events, signing_keys
  - [ ] Multi-grant resolver (order + subscription + trial + manual + promo overlap handled correctly)
  - [ ] Full 13-state subscription state machine
  - [ ] Webhook handler decoupled: returns 200 within 500ms; side effects run from job queue only
  - [ ] Auth class table: every route tagged; untagged routes fail to register at startup
  - [ ] Rate limits per route class with RateLimit-* response headers; 429 on limit with Retry-After
  - [ ] Error response contract: canonical error codes enumerated; no inline error codes in code
  - [ ] effective_entitlements materialised projection: UPSERT on every grant/revocation write; checks read from projection
  - [ ] Trial expiry job: reminder email 3 days before, incomplete → suspended → cancelled after 30 days
  - [ ] Ed25519 key distribution: /api/public/signing-keys endpoint; 30-day rotation with 7-day overlap; 5-min clock skew tolerance; 30-day offline grace
  - [ ] Server-side lease cache (LRU keyed by licence+policy+key version); invalidated on entitlement change
  - [ ] entitlement_grants.subscription_id and .order_id FKs populated atomically at grant creation
  - [ ] Grace policy stored as grace_policy_snapshot JSONB at grant creation time
  - [ ] Composite indexes for all Phase 7 tables in same migration
  - [ ] Grace policy per offer; payment recovery and reactivation flows
  - [ ] Product-key generation (high entropy, hash-only storage, revocation, activation limits)
  - [ ] Entitlements and licensing APIs live
  - [ ] Signed lease with `validUntil`, `offlineUntil`, Ed25519 signature
  - [ ] Signing-key management: table, current/previous key, public-key endpoint, rotation runbook
  - [ ] Email fulfilment: confirmation, redemption link, billing portal, activation instructions
  - [ ] Customer area, admin grant/revoke, subscription state UI (Tomas)
- [ ] **Phase 7.5** — Identity, accounts and product users
  - [ ] Tables: accounts, account_emails, account_sessions, account_links, product_users, product_user_links, seats, seat_assignments, signing_keys_metadata (extends Phase 7 licence_signing_keys), integration_clients, integration_credentials, integration_webhook_endpoints, integration_webhook_deliveries
  - [ ] Phase 7 → 7.5 bridge migration: populate entitlement_grants.account_id where customer email matches account email
  - [ ] Mode A (Acronym Identity / OIDC), Mode B (BYOI), Mode C (licence-only)
  - [ ] Multi-grant effective state machine: pending → trial → active → grace → read_only → suspended → expired → denied
  - [ ] Offline signed leases with clock-rollback detection
  - [ ] Device activation limits and self-service reset
  - [ ] Seats with invitation and release flows
  - [ ] Outbound integration webhooks: signed, retry, idempotent, dead-letter
  - [ ] Integration webhook acknowledge endpoint
  - [ ] Customers dashboard area: Accounts, Product Users, Entitlements, Licences, Activations, Access Incidents (Tomas)
  - [ ] Admin entitlement actions UI (Tomas)

### Milestone E — Intelligence and Launch
- [ ] **Phase 8** — Product analytics and external integrations
  - [ ] Tables: integration_keys, integration_key_events, product_events, product_metric_hourly, product_metric_daily, error_groups, release_reports, external_heartbeats
  - [ ] Integration key scopes: heartbeat, events, errors, releases, metrics, entitlements:check, licences:validate
  - [ ] Ingestion endpoints: heartbeat, releases, errors, events, metrics
  - [ ] Aggregation jobs: hourly, daily, compact.raw, retention.cleanup
  - [ ] Rate-limiting and size caps on all ingestion endpoints
  - [ ] Analytics never blocks Stripe webhooks, entitlement checks, or deploy rollback
  - [ ] Analytics uses dedicated PgBouncer pool (max 5 connections, 5s statement timeout); COPY/bulk INSERT only
  - [ ] CORS policy enforced by Fastify middleware: public-safe = *, integration-key = registered origins only, admin = same-origin only
  - [ ] Public DTO serialiser allowlist enforced in code; throws in non-prod if non-whitelisted field present; logs audit event in prod
  - [ ] Webhook HMAC rotation: dual-secret inbound (Stripe), dual-sign outbound (7-day overlap)
  - [ ] SSRF prevention: outbound webhook URLs validated against blocked CIDR list; re-resolved on every delivery
  - [ ] Integration key UI, analytics dashboards, error groups, release reports (Tomas)
- [ ] **Phase 8.5** — App Builder Framework and SDKs
  - [ ] `systems.app.json` manifest schema and server-side validation
  - [ ] Acceptance levels 0–5 enforced at deploy time
  - [ ] Health/ready/version endpoint contract enforcement
  - [ ] Smoke test framework gates releases
  - [ ] Integration testing harness and 41-item acceptance checklist
  - [ ] `@systems/node` server SDK
  - [ ] `systems-python` SDK
  - [ ] `systems-cli` (manifest validate, acceptance check, smoke test runner)
  - [ ] App certification UI, integration status dashboard (Tomas)
  - [ ] `@systems/browser` SDK — no secret keys (Tomas)
  - [ ] Developer docs: API reference, per-app-type guide, RUNBOOK.md template (Tomas)
  - [ ] External developer guide withheld until Phase 9 completes (guide assumes Phase 7 entitlements and Phase 8 integration keys are both live)
  - [ ] Container security enforced: non-root USER required; read-only rootfs; memory 512MB, CPU 0.5, pids 100
  - [ ] Docker build admission control: CPU/RAM headroom check before accept; per-system deploy lock; max 10 pending
- [ ] **Phase 9** — Hardening, operations and launch readiness
  - [ ] RBAC roles: owner / admin / operator / commerce / viewer
  - [ ] TOTP enforced option; session revocation
  - [ ] Secret write-only UI; integration key hashing; licence signing key rotation
  - [ ] Stripe webhook signing enforcement
  - [ ] Media quarantine: SVG sanitization, malware rejection, content-type-by-bytes, metadata stripping
  - [ ] Emergency controls: revoke all sessions, freeze deployments, quarantine routes
  - [ ] Structured observability: JSON logging, request ID correlation, latency/error metrics, secret redaction
  - [ ] Public API allowlist automated enforcement and audit
  - [ ] Admin audit coverage audit
  - [ ] Rate limits per route class
  - [ ] Backup/restore reliability drill (all subsystems)
  - [ ] Runbooks: deploy, rollback, Stripe incident, entitlement recovery, backup/restore, key rotation, device reset, app integration, domain recovery, security incident
  - [ ] Load and resource protection testing (Tomas)
  - [ ] Legal/compliance launch gates signed off (Tomas)
  - [ ] Launch rehearsal completed (both)
  - [ ] All V4 + legacy tests pass
  - [ ] Restore drill from S3 passes on a completely clean host with no local files
  - [ ] Test purchase and full subscription lifecycle (including cancellation and GDPR erasure) passes
  - [ ] Emergency controls UI tested: each button executes the correct action and creates an audit event
  - [ ] Security headers verified on all responses (HSTS, CSP, X-Content-Type-Options, etc.)
  - [ ] SQL injection lint rule: zero template literals inside db.query() calls
  - [ ] Timing-safe comparison: crypto.timingSafeEqual used for all HMAC/signature verification
  - [ ] Input size limits verified: 413 returned before body parsing on oversized payloads
  - [ ] Secret scanning CI check passes with zero findings
  - [ ] npm audit returns zero high/critical vulnerabilities with available fixes
  - [ ] Path traversal prevention: all user-provided filenames replaced with UUID; extension from bytes
  - [ ] Log injection: all user-supplied strings sanitised before logging
  - [ ] Attack response playbook tested (credential stuffing simulation, webhook forgery simulation)
  - [ ] Security incident response runbook reviewed by both Alex and Tomas
  - [ ] TOTP mandatory for all admin accounts; session timeout set to 8 hours
  - [ ] Domain verification token uses 256 bits of entropy; expires after 48 hours
  - [ ] Stripe API rate limit handling: exponential backoff with Retry-After in all reconciliation jobs
  - [ ] Media upload atomicity: pending record + S3 upload + confirm; orphan cleanup job active
  - [ ] Stripe raw body preservation verified: signature check passes using pre-parse bytes
  - [ ] No regex constructed from user input in any domain matching code
  - [ ] PostgreSQL database encoding verified as UTF8 with LC_COLLATE='C'
  - [ ] Legal/compliance launch gates signed off (Tomas)
  - [ ] Launch rehearsal completed (both)

---

## Detailed task tables by phase

### Phase 0 — Stabilise current repository

| Task | Owner |
|------|-------|
| ~~Add `PATCH` to Fastify CORS~~ ✅ | Alex |
| ~~Global request ID generation + add to logs and audit entries~~ ✅ | Alex |
| ~~`GET /api/server/schema` endpoint~~ ✅ | Tomas |
| ~~`GET /api/server/features` endpoint~~ ✅ | Tomas |
| ~~Global API error response shape~~ ✅ | Tomas |
| Stricter JSON payload-size defaults | Alex |
| ~~Pagination defaults and maximums~~ ✅ | Tomas |
| ~~SQLite-in-production warning~~ ✅ | Tomas |
| Feature flag helper for V4 gates | Alex |
| `schema_migrations` table + migration runner skeleton | Alex |
| Stop using silent `ALTER TABLE` blocks for new schema | Alex |
| Test-only migration reset utility | Alex |
| `jobs` table, in-process runner (disabled by default), lock/unlock, retry/backoff | Alex |
| Confirm host-protection invariants (concurrency caps, disk admission, upload limits, cache headers, container limits) | Alex |
| Tests: CORS PATCH, feature flags, migration runner, job table | Alex |
| ~~Tests: schema endpoint responses, error shape contract, pagination envelope~~ ✅ | Tomas |
| Job dashboard placeholder under Server | Tomas |
| Pagination controls on existing list views | Tomas |
| Choose and document email provider; set SEND_EMAIL_PROVIDER env var; add staging email smoke test to exit gate | Alex |
| Allocate staging environment (separate PostgreSQL, Stripe test account, Caddy, staging.systems.acronym.sk, staging.acronym.sk) | Alex |
| Choose monitoring stack; define alert thresholds (disk, connections, checkout error rate, webhook queue age, build queue depth, dead-letter count); assign on-call rotation | Alex |
| **[Management action]** Engage Slovak/EU legal professional — submit VAT treatment, withdrawal right wording, GDPR erasure workflow, and checkout consent copy for review; obtain written sign-off before Phase 6 go-live | Acronym management |

### Phase 0.5 — Baseline snapshot and namespace lock

| Task | Owner |
|------|-------|
| Commit baseline report (tests, lint, API route list, SQLite schema dump, Caddy inventory, Docker labels, backup dry run, feature flags) | Tomas |
| Namespace boundary tests (`/api/public/*`, `/api/ingest/*`, `/api/webhooks/*`, admin routes) | Tomas |
| Document namespace strategy | Tomas |
| ~~Deprecation header helper (ready to apply once V4 replacements exist)~~ ✅ | Tomas |

### Phase 1 — PostgreSQL and migration foundation

| Task | Owner |
|------|-------|
| `api/src/db/postgres.js` and `sqlite-legacy.js` | Alex |
| `api/src/db/repositories/` structure | Alex |
| `api/src/db/migrate.js` runner | Alex |
| `api/src/db/migrations/` directory with first foundational tables (`schema_migrations`, `organisations`, `admin_users`, `admin_sessions`, `platform_settings`, `audit_log_v4`, `jobs`) | Alex |
| Environment vars: `SYSTEMS_DB_ENGINE`, `DATABASE_URL`, `MIGRATIONS_AUTO_RUN` | Alex |
| Migration scripts: `migrate-sqlite-to-postgres.js`, `verify-postgres-migration.js`, Windows PowerShell equivalents | Alex |
| Repository facades: `usersRepository`, `settingsRepository`, `auditRepository`, `jobsRepository` | Alex |
| Extend backup/restore scripts to include PostgreSQL `pg_dump`, migration state, job table, platform settings, audit | Alex |
| Tests: connection, migration order, checksum, failure, backup includes PG, restore dry run | Alex |
| Verify SQLite legacy mode: all pre-V4 tests and Phase 0.5 namespace boundary tests still pass after Phase 1 migration; regression check included in Phase 1 exit gate | Tomas |
| Deploy PgBouncer as sidecar; configure pool_mode=transaction, max_db_connections=20, default_pool_size=5; all code connects via port 6432; pool exhaustion returns 503 | Alex |
| Configure S3-compatible backup destination (bucket, encryption key, retention policy); backup uploads to S3; restore drill on clean host with zero local files | Alex |
| Define composite indexes for all Phase 1 tables in same migration file (audit_log_v4, jobs, admin_sessions) | Alex |
| Enforce per-type job concurrency (build: 1, reconciliation: 3, email: 10, analytics: 5, webhook retry: 20); dead-letter after 3 attempts; purge completed after 7 days | Alex |
| Session tokens: crypto.randomBytes(32); session ID rotated on every login; max 5 concurrent sessions per admin | Alex |

---

## Milestone B — V4 Operational Core

### Phase 2 — Introduce V4 Products/Systems model

| Task | Owner |
|------|-------|
| New tables: `products`, `systems`, `system_environments`, `releases`, `domains`, `environment_secrets`, `infrastructure_metrics`, `health_snapshots`, `legacy_project_map` | Alex |
| Migration bridge: `projects → legacy_project_map → systems → production env → release → domain` | Alex |
| Field mapping script (name, slug, deploy_type, status, repo, visibility, health_path, container_id, port, previous_*, etc.) | Alex |
| Read APIs: `GET /api/systems`, `/api/systems/:id`, `/api/systems/:id/environments`, `/api/systems/:id/releases`, `GET /api/products`, `/api/products/:id` | Tomas |
| Write APIs: `POST /api/systems`, `PATCH /api/systems/:id`, `POST /api/products`, `PATCH /api/products/:id` | Alex |
| Legacy API compatibility layer (`GET /api/projects` reads from V4 tables when `ENABLE_V4_SYSTEMS=true`) | Tomas |
| Tests: legacy API still works, read API returns migrated projects, health/stats/route mapping correctness | Tomas |
| Tests: project-to-system migration integrity, field mapping completeness | Alex |
| Dashboard Systems page renders V4-backed systems through same visual layout | Tomas |
| Hidden admin/test Product page | Tomas |
| Org-scoping enforcement: every repository method includes WHERE organisation_id = $n; CI lint rule rejects unscoped queries on scoped tables | Alex |
| Phase 2 acceptance tests: org A admin cannot read org B systems by ID; direct ID manipulation is rejected | Alex |

### Phase 2.5 — Migration reconciliation checkpoint

| Task | Owner |
|------|-------|
| `api/scripts/reconcile-v4-migration.js` (verifies every project → system mapping, containers → releases, routes → domains, encrypted vars, history rows, backup coverage) | Tomas |
| Operator dashboard report: mapped/unmapped projects, orphan containers/routes, missing domains/releases, decryption failures, backup coverage status | Tomas |

### Phase 3 — Move deploy engine to Systems/Environments

| Task | Owner |
|------|-------|
| New deployment routes: `POST /api/systems/:id/environments/:env/deploy|redeploy|rollback`, `GET /api/systems/:id/environments/:env/logs|stats` | Alex |
| Legacy routes (`POST /api/deploy`, `POST /api/projects/:slug/redeploy|rollback`) wired through mapping layer | Tomas |
| Tests: legacy deploy routes return identical response contract as new routes for same input; routing transparency verified | Tomas |
| Extract `deployService`: `detect`, `extract`, `build`, `runContainer`, `verifyHealth`, `recordRelease`, `publishRoute`, `rollback` | Alex |
| Docker container labels: `systems.organisation_id`, `system_id`, `environment_id`, `release_id`, `slug`, `environment` | Alex |
| Backend support for `production` + `preview` environments | Alex |
| `POST /api/systems/:id/promote` with full promotion flow (health pass → container start → route switch → retain previous if one exists → record release); retain step is a no-op on first-ever deployment | Alex |
| Tests: new deploy route, container labels, preview/production isolation, promotion health gate, rollback, failed deploy safety, **first deployment succeeds with no previous release** | Alex |

### Phase 4 — Domains, routing, access and maintenance

| Task | Owner |
|------|-------|
| `domains`, `maintenance_windows`, `route_publication_attempts` tables | Alex |
| Domain-driven Caddy `renderRoute()` service (hostname, upstream, access policy, basic auth, canonical redirect, maintenance, attestation) | Alex |
| Route publication transaction: write pending → validate Caddy config → reload → probe → mark active | Alex |
| Custom domain verification flow: add hostname → generate token → DNS instructions → verify TXT/CNAME/A → publish → check TLS → canonical selection | Alex |
| Tests: default subdomain, private system, password route, reload failure safety, custom domain without verification blocked, canonical redirect, maintenance mode route | Alex |
| Domain management UI in dashboard | Tomas |
| Custom domain add/verify wizard UI | Tomas |
| Maintenance mode UI controls | Tomas |
| Canonical redirect configuration UI | Tomas |
| Replace route_published BOOLEAN with route_status TEXT enum (inactive/pending/active/failed/superseded) + route_last_error + route_last_published_at | Alex |
| Create system_environment_routes junction table with (system_id, environment_id, domain_id, route_status) and composite indexes | Alex |
| Route publication atomicity: Caddy reload failure reverts status to 'failed'; never mark active before probe passes; promotion uses junction table | Alex |

---

## Milestone C — Acronym Public Portfolio

### Phase 5 — Portfolio CMS and Acronym public renderer

| Task | Owner |
|------|-------|
| `GET /api/public/catalog?locale=sk|en`, `GET /api/public/products/:slug?locale=sk`, `GET /api/public/snapshot/latest?locale=en` | Alex |
| Public API field allowlist enforcement (no container IDs, ports, repo URLs, logs, internal routes, admin IDs, customer/billing data, secret names) | Alex |
| Deploy `acronym.sk` as first primary V4 system | Alex |
| Portfolio tables: `portfolio_pages`, `product_portfolio_profiles`, `portfolio_blocks`, `portfolio_snapshots`, `portfolio_redirects`, `public_forms`, `form_submissions`, `lead_status`, `media_assets`, `legal_versions` | Tomas |
| Draft CMS → validation → preview snapshot → publish → immutable snapshot pipeline | Tomas |
| Dashboard Portfolio area: homepage editor, navigation editor, product-page editor, media library, legal pages, redirects, locales, preview, publish history, snapshot rollback | Tomas |
| SK/EN locale support: localised slugs, SEO, language switch mapping, translation completeness indicator, fallback rules, localised legal pages | Tomas |
| `acronym.sk` renderer: pre-rendered pages, snapshot cache, last-known-good snapshot, ETag, stale-while-revalidate, hashed assets, no live DB dependency | Tomas |
| Tests: draft change does not alter public site, publish creates immutable snapshot, snapshot rollback, SK/EN render, missing translation visible, public API hides private fields, renderer works during SYSTEMS API outage | Tomas |
| Precomputed S3 catalog: publish action serialises catalog JSON to S3; CDN pointer updated atomically; /api/public/* reads from S3/CDN, never from PostgreSQL | Alex |
| Media upload pipeline: quarantine → security scan (SVG sanitize, malware check, content-type by bytes) → convert → permanent S3 URL; EXIF strip; variants generated | Alex |
| Max snapshot size 2MB enforced; media stored by URL only (never embedded); orphan cleanup job for failed uploads | Alex |
| Concurrent publish lock (publish_locks table with 5-minute TTL); concurrent publishes rejected | Tomas |
| Snapshot schema versioning: schema_version + renderer_min_version columns; renderer refuses incompatible snapshots and alerts (never silent fallback) | Tomas |

---

## Milestone D — Paid Products

### Phase 6 — Commerce foundation

| Task | Owner |
|------|-------|
| Commerce tables: `offers` (with `entitlement_template` JSON column), `customers`, `orders`, `subscriptions`, `payment_webhook_events`, `checkout_disclosures` | Alex |
| Stripe Checkout integration | Alex |
| Stripe Customer Portal integration | Alex |
| Signed Stripe webhook endpoint with idempotency | Alex |
| Manual order + complimentary order creation | Alex |
| Subscription state mirroring from Stripe (`trialing`, `active`, `past_due`, `cancel_at_period_end`, `cancelled`, `expired`) | Alex |
| Reconciliation jobs: `stripe.reconcile.checkout_sessions`, `subscriptions`, `invoices`, `orders` (NOT entitlements — that table doesn't exist until Phase 7) | Alex |
| Capture per-checkout: terms version, privacy version, withdrawal consent, marketing consent, locale, billing country, VAT evidence | Tomas |
| Tests: checkout session creation, webhook signature verification, duplicate webhook dedup, subscription lifecycle, manual order audit | Alex |
| Tests: disclosure record created per checkout session, per-locale disclosure verified, withdrawal consent stored and retrievable | Tomas |
| Checkout flow UI (product page → create session → Stripe Checkout → confirmation page) | Tomas |
| Legal/compliance capture UI (consent checkboxes, withdrawal consent, marketing consent) | Tomas |
| Orders and subscriptions dashboard views | Tomas |
| Soft-delete columns (deleted_at TIMESTAMPTZ) on customers, accounts, product_users, account_emails, entitlement_grants; all repository queries filter WHERE deleted_at IS NULL | Alex |
| data_subject_requests table and erasure workflow: legal hold check → Stripe customer deletion → PII anonymisation → entitlement revocation → session invalidation (all atomic) | Alex |
| VAT/Stripe Tax: automatic_tax enabled on all checkout sessions; tax amounts stored in orders table; B2B zero-rate with VAT number validation; no manual override | Alex |
| Subscription cancellation flow: SYSTEMS. UI (not Stripe Portal); Slovak 14-day withdrawal right disclosure; pro-rata refund calculation; durable cancellation record | Tomas |
| Webhook advisory lock: pg_try_advisory_xact_lock on event ID before any processing; concurrent duplicate test in acceptance suite | Alex |
| subscriptions.entitlement_grant_id FK (NULL until Phase 7); idempotency_key UNIQUE on orders; idempotency_key UNIQUE on entitlement_grants | Alex |
| offers.entitlement_template_version INT; Phase 7 reads this to know which schema to validate against | Alex |
| Stripe API rate limit handling: exponential backoff with Retry-After header in all Stripe API calls from reconciliation jobs | Alex |

### Phase 7 — Entitlements, product keys and licensing

| Task | Owner |
|------|-------|
| Entitlement tables: `entitlement_grants` (with nullable `account_id` FK for Phase 7.5 forward-compat), `entitlement_revocations`, `entitlement_resolution_snapshots`, `effective_entitlements`, `licences`, `licence_activations`, `entitlement_events`, `licence_events`, `licence_signing_keys` | Alex |
| Entitlement grant resolver (handles lifetime purchase + subscription, grace access, refund overlap, upgrade/downgrade, admin grants) | Alex |
| Product-key generation (high entropy, store hash only, raw key shown only at creation/redemption, revocation, replacement, activation limits, full audit) | Alex |
| APIs: `POST /api/entitlements/check|admin/grant|admin/revoke`, `POST /api/licensing/redeem|activate|validate|deactivate` | Alex |
| Signed licence leases (`validUntil`, `offlineUntil`, `features`, subscription state, signature) | Alex |
| Licence signing-key management: table, current/previous key support, key ID in leases, public-key endpoint, revocation-list endpoint, emergency key-rotation runbook | Alex |
| Full subscription state machine: `active → payment_failed → past_due → grace → suspended → recovered|cancelled|expired|refunded|chargeback|manual_revoked` — all 13 states with distinct behaviour | Alex |
| Payment recovery and reactivation workflows (Stripe retry, self-serve update, admin reactivate, data restoration on reactivation) | Alex |
| Grace policy per offer: configurable grace duration, full vs. read-only access during grace | Alex |
| Email fulfilment: purchase confirmation, redemption link, billing portal link, licence activation instructions, support link | Tomas |
| Tests: one-time purchase creates perpetual entitlement, subscription creates renewable entitlement, duplicate webhook dedup, refund/chargeback revocation, key redemption once, activation limit, signed lease, expired subscription grace/suspension, SYSTEMS outage offline lease | Alex |
| Licence redemption UI | Tomas |
| Admin entitlement grant/revoke UI | Tomas |
| Customer account area (subscription status, active licences, billing portal link) | Tomas |
| Subscription state display with grace/suspension indicators | Tomas |
| Webhook handler decouples from side effects: INSERT event + INSERT job in one transaction, return 200 immediately; no inline entitlement creation or email sending | Alex |
| Auth class table: every route tagged with auth class; middleware enforces class; routes without class fail to register at startup | Alex |
| Rate limits per route class: /api/licensing/validate 100/min per licence, /api/entitlements/check 500/min per key, /api/identity/token 20/min per IP; RateLimit-* headers on all responses | Tomas |
| Error response contract: canonical error code list in spec; no inline error codes in route handlers; SDKs treat unknown codes as INTERNAL_ERROR | Tomas |
| effective_entitlements materialised projection: UPSERT on every grant/revocation write; checks read from projection only; reconciliation job detects and repairs divergence | Alex |
| Trial expiry job: 3-day reminder email; incomplete on trial end with no payment method; cancelled + expired after 30 days incomplete | Alex |
| Ed25519 public key endpoint /api/public/signing-keys: 30-day rotation, 7-day overlap, 5-min clock skew tolerance, 30-day offline grace, clock rollback detection | Alex |
| Server-side lease cache: LRU keyed by (licence_id, policy_version, key_version); refresh_after at 4 min (validUntil at 5 min); invalidated on entitlement change | Alex |
| entitlement_grants.subscription_id FK and .order_id FK populated atomically at grant creation; grace_policy_snapshot JSONB stored at grant time | Alex |
| Composite indexes for all Phase 7 tables in same migration as table creation | Alex |
| Stripe raw body preservation: rawBody stored before JSON parsing; passed to stripe.webhooks.constructEvent() directly | Alex |

---

## Milestone E — Intelligence and Launch

### Phase 7.5 — Identity, accounts and product users

| Task | Owner |
|------|-------|
| Tables: `accounts`, `account_emails`, `account_sessions`, `account_links`, `product_users`, `product_user_links` | Alex |
| Tables: `seats`, `seat_assignments`, `signing_keys_metadata` | Alex |
| Tables: `integration_clients`, `integration_credentials`, `integration_webhook_endpoints`, `integration_webhook_deliveries` | Alex |
| Mode A — Acronym Identity: OIDC/OAuth 2.1 Authorization Code + PKCE for browser/native clients | Alex |
| Mode B — Bring-your-own-identity (BYOI): scoped `external_user_id` product-user record | Alex |
| Mode C — Licence-only: binds to installation/device or optional account, no general login identity | Alex |
| Account merge: audited, never implicit from matching email alone | Alex |
| Phase 7 → 7.5 bridge migration: populate `entitlement_grants.account_id` where customer email matches a known account email (audited, non-destructive) | Alex |
| Entitlement resolver: full multi-grant (order + subscription + trial + manual + promo overlap), cancelling one source must not revoke access from another | Alex |
| Effective state machine: `pending`, `trial`, `active`, `grace`, `read_only`, `suspended`, `expired`, `denied` | Alex |
| Offline signed licence leases: Ed25519 asymmetric signing, clock-rollback detection, `offlineUntil`, degraded/read-only access modes | Alex |
| Device activations: privacy-minimised device ID, activation limits, self-service reset | Alex |
| Seats: assignable units within multi-user entitlements, invitation and release flows | Alex |
| Integration webhook delivery: signed outbound webhooks on access changes, retry with exponential backoff, idempotency, dead-letter routing | Alex |
| New APIs: `POST /api/identity/authorize`, `POST /api/identity/token`, `POST /api/product-users/upsert`, `POST /api/product-users/link-account`, `POST /api/entitlements/batch-check`, `POST /api/integration-webhooks/acknowledge` | Tomas |
| Server SDK responsibilities: credential handling, local entitlement cache, signature verification, webhook verification and deduplication | Alex |
| Emergency key-rotation runbook | Alex |
| Dashboard — new Customers area: Accounts, Product Users, Entitlements, Licences, Activations, Access Incidents sub-sections | Tomas |
| Admin actions UI: grant complimentary/time-limited access, extend grace, replace/revoke licence, reset device, assign/release seat, resend redemption, reconcile with Stripe, export entitlement evidence | Tomas |
| Product-user analytics dashboard (active users, registered users, entitlement state breakdown per product) | Tomas |
| SDK documentation and integration guide for Mode A, B, and C | Tomas |

### Phase 8 — Product analytics and external integrations

| Task | Owner |
|------|-------|
| `integration_keys` and `integration_key_events` tables | Alex |
| Integration key scopes: `heartbeat:write`, `events:write`, `errors:write`, `releases:write`, `metrics:write`, `entitlements:check`, `licences:validate` | Alex |
| Ingestion endpoints: `POST /api/ingest/heartbeat|releases|errors|events|metrics` | Alex |
| Event storage tables: `product_events`, `product_metric_hourly`, `product_metric_daily`, `error_groups`, `release_reports`, `external_heartbeats` | Alex |
| Aggregation jobs: `analytics.aggregate.hourly`, `analytics.aggregate.daily`, `analytics.compact.raw`, `analytics.retention.cleanup` | Alex |
| Rate-limiting and payload size caps on ingestion endpoints | Alex |
| Tests: bad key rejected, scoped key access enforcement, event size cap, heartbeat updates system health, release report in dashboard, daily metric aggregation, high-volume rate limiting, analytics failure isolation from entitlement checks | Alex |
| Integration key management UI (create, rotate, revoke) | Tomas |
| Analytics dashboard (product metrics, operational metrics — separated) | Tomas |
| Error groups UI | Tomas |
| Release reports UI | Tomas |
| External system health display | Tomas |
| Event volume monitoring display | Tomas |
| Analytics dedicated PgBouncer pool (max 5 connections, 5s statement timeout); batched COPY/bulk INSERT; aggregation jobs defer if lock unavailable within 1s | Alex |
| CORS middleware: /api/public/* = any origin; integration routes = registered origins only; admin routes = same-origin only; origin registration in integration_keys.allowed_origins | Tomas |
| Public DTO allowlist serialiser: explicit field whitelist; throws in non-prod on extra fields; audit event in prod | Tomas |
| Webhook rotation: Stripe dual-secret (try both, remove old after 7 days); outbound dual-sign (7-day overlap); drill in Phase 9 | Alex |
| SSRF prevention: outbound webhook URLs checked against blocked CIDRs (10.x, 172.16.x, 192.168.x, 169.254.x); re-resolved on every delivery (DNS rebinding prevention) | Alex |

### Phase 8.5 — App Builder Framework and SDKs

| Task | Owner |
|------|-------|
| `systems.app.json` manifest schema definition (`schema: systems.app.v4`) and server-side validation tooling | Alex |
| App acceptance level definitions and enforcement at deploy time: Level 0 (static), 1 (managed web), 2 (commercial), 3 (licensed/subscription), 4 (external), 5 (fully native) | Alex |
| Build detection and framework inference (Dockerfile, static output dir, supported frameworks) | Alex |
| Health/ready/version endpoint contract enforcement: `GET /api/health`, `GET /api/ready`, `GET /api/version` | Alex |
| Smoke test framework: run `scripts/systems-smoke-test.*` after deploy, gate release on result | Alex |
| Integration testing harness and 41-item acceptance checklist validation | Tomas |
| Runtime requirement enforcement: listen on `0.0.0.0`, graceful SIGTERM shutdown, no root privilege, stdout/stderr logs | Alex |
| App-level data export/deletion workflows (GDPR compliance per app) | Alex |
| Server SDK: `@systems/node` — entitlement check, event batching, webhook verification, local cache, signature verification | Alex |
| CLI tool: `systems-cli` — manifest validate, acceptance check, smoke test runner | Alex |
| SDK for Python: `systems-python` — same server-side responsibilities | Alex |
| Dashboard: app acceptance level display and certification status per system | Tomas |
| Dashboard: app monitoring and health aggregation (per acceptance level) | Tomas |
| Dashboard: developer-facing integration status and manifest validation results | Tomas |
| Browser SDK: `@systems/browser` — public-client entitlement check (no secret keys), event emission | Tomas |
| Developer documentation: API reference, integration contract spec, guides per app type, `RUNBOOK.md` template | Tomas |
| Common rejection reasons and troubleshooting guide | Tomas |
| Container security enforcement: non-root USER required for acceptance level ≥ 2; memory 512MB, CPU 0.5, pids 100; no privileged, no host network, no docker socket | Alex |
| Docker build admission control: CPU/RAM headroom check (25% reserved) before accepting deploy; per-system deploy lock; max 10 pending builds in queue | Alex |

### Phase 9 — Hardening, operations and launch readiness

| Task | Owner |
|------|-------|
| RBAC roles: owner/admin/operator/commerce/viewer | Alex |
| TOTP enforced option | Alex |
| Session revocation | Alex |
| Secret write-only UI (write but never display raw) | Tomas |
| Integration key hashing | Alex |
| Licence signing key rotation runbook + tooling | Alex |
| Stripe webhook signing enforcement | Alex |
| Media quarantine pipeline: SVG/script sanitization, malware detection/rejection, content-type verification by bytes, responsive variant generation, focal point + alt-text recording, metadata stripping | Alex |
| Emergency controls: revoke all sessions, disable/rotate all credentials, freeze deployments and publishing, quarantine product routes, activate maintenance mode | Alex |
| Structured observability: JSON logging standard, request ID correlation across checkout/webhook/deployment, latency/error rate metrics, secret redaction rules, product key non-logging enforcement | Alex |
| Public API allowlist automated enforcement and audit (no container IDs, ports, repo URLs, logs, admin IDs, customer/billing data, secret names) | Alex |
| Admin audit coverage audit (every dangerous action has an audit event) | Tomas |
| Rate limits per route class | Alex |
| Backup/restore reliability drill: PostgreSQL, Caddy, media, portfolio snapshot, commerce, entitlement, licence, jobs | Alex |
| `V4_DEPLOY_RUNBOOK.md`, `V4_ROLLBACK_RUNBOOK.md`, `V4_STRIPE_INCIDENT_RUNBOOK.md`, `V4_ENTITLEMENT_RECOVERY_RUNBOOK.md`, `V4_BACKUP_RESTORE_RUNBOOK.md` | Alex |
| `V4_LICENSING_KEY_ROTATION_RUNBOOK.md`, `V4_DEVICE_RESET_RUNBOOK.md`, `V4_APP_INTEGRATION_RUNBOOK.md` | Alex |
| Load and resource protection testing: large upload cap, build concurrency, disk admission, container memory/CPU limits, analytics event flood, webhook burst, public catalog cache, renderer last-known-good | Tomas |
| Legal/compliance launch gate coordination (terms, privacy, cookie policy, withdrawal flow, subscription cancellation wording, VAT/accounting, refund/complaints, GDPR export/delete, accessibility) | Tomas |
| `V4_DOMAIN_RECOVERY_RUNBOOK.md`, `V4_SECURITY_INCIDENT_RUNBOOK.md` | Tomas |
| Launch rehearsal: deploy portfolio renderer, publish SK/EN snapshot, deploy test product, create offer, Stripe test purchase, create entitlement, redeem licence, simulate failed payment, simulate recovery, simulate refund, restore backup on clean machine, roll back product release, roll back portfolio snapshot | Tomas |
| SQL injection lint rule: CI fails on any template literal inside db.query() call | Alex |
| Timing-safe comparison: all HMAC/signature verification uses crypto.timingSafeEqual(); code review checklist includes this check | Alex |
| Security response headers: HSTS preload, X-Content-Type-Options, X-Frame-Options DENY, strict CSP with nonce on admin HTML | Alex |
| Input size limits: 413 returned before body parsing on all endpoints; limits documented in API contract | Alex |
| Path traversal prevention: all user-provided filenames replaced with UUID; file extension from bytes only | Alex |
| Log injection prevention: sanitizeForLog() applied to all user-supplied strings before logging | Alex |
| Secret scanning in CI: trufflehog or gitleaks on every push; build fails on any detected secret | Alex |
| npm audit in CI: fails on high/critical vulnerabilities with available fix; exceptions documented in SECURITY_EXCEPTIONS.md | Alex |
| Container security enforcement: non-root USER required for acceptance level ≥ 2; memory 512MB, CPU 0.5, pids 100; no privileged, no host network, no docker socket | Alex |
| Docker build admission control: CPU/RAM headroom check (25% reserved) before accepting deploy; per-system deploy lock; max 10 pending builds in queue | Alex |
| Emergency controls UI: one-click actions for all 7 emergency scenarios; 60-second cooldown; audit event for every action | Tomas |
| Attack response playbook: credential stuffing, webhook forgery, key compromise, session hijack, DDoS — each tested in the Phase 9 rehearsal | Tomas |
| Domain verification token: crypto.randomBytes(32); 48-hour expiry; no oracle leak (expired vs. never existed indistinguishable) | Alex |
| PostgreSQL character set verification: UTF8 encoding, LC_COLLATE='C' | Alex |
| Media upload atomicity: pending record → S3 upload → confirm; orphan cleanup job active | Alex |
| TOTP mandatory for all admin accounts; 8-hour session timeout; no exceptions | Alex |
| Idempotency requirements: Idempotency-Key header required and enforced on all state-mutating external-facing endpoints | Alex |

---

## Ownership summary

| Phase | Primary Alex | Primary Tomas |
|-------|--------------|--------------|
| 0 | Backend hardening (CORS, request IDs, migration runner, jobs, host invariants) | Schema/features endpoints, error shape, pagination, SQLite warning, job UI, pagination UI |
| 0.5 | — | Baseline report, namespace tests, deprecation helper |
| 1 | PostgreSQL foundation, all migration tooling, PgBouncer, S3 | SQLite legacy mode regression verification |
| 2 | DB tables, migration bridge, write APIs, org-scoping | Read APIs, legacy compatibility layer, Systems/Products dashboard |
| 2.5 | — | Reconciliation script, operator report |
| 3 | Deploy engine (deployService, new routes, promotion, Docker labels) | Legacy route wiring through mapping layer |
| 4 | Caddy service, domain verification backend | Domain management UI, maintenance UI |
| 5 | Public catalog API, S3 pipeline, acronym.sk deployment | Portfolio CMS, snapshot pipeline, renderer, locale support |
| 6 | Commerce backend, Stripe, reconciliation jobs, GDPR erasure | Checkout UI, disclosure capture (backend + UI), compliance UI |
| 7 | Entitlements engine, licences, signing keys, state machine | Customer UI, admin UI, email fulfilment, error contract, rate limit headers |
| 7.5 | OIDC/BYOI identity, multi-grant resolver, offline leases, devices, seats | Identity API routes, customers dashboard area, admin entitlement actions UI, SDK docs |
| 8 | Integration keys, ingestion, aggregation jobs, SSRF/security | Analytics dashboards, integration key UI, CORS policy, public DTO serialiser |
| 8.5 | Manifest schema, acceptance levels, smoke test, server SDK, CLI | Integration testing harness, app certification UI, browser SDK, developer docs |
| 9 | RBAC, security hardening, media quarantine, observability, backup drills, core runbooks | Secret write-only UI, emergency controls UI, audit coverage audit, attack playbook, load testing, legal gates, launch rehearsal |

---

## Cross-cutting rules (both devs)

- Every phase must exit with its feature flag gating new behaviour.
- A phase is not done without tests, rollback documentation, and audit events for dangerous actions.
- Never silent-swallow errors (`try { } catch {}`).
- PR size: one migration + one repository + one route group + tests.
- Never mix schema + dashboard + deploy engine + Stripe in one PR.
