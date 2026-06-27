# SYSTEMS. V4 — Developer Allocation

**Status:** Active  
**Branch:** `claude/v4-roadmap-allocation-jxue3e`  
**Updated:** 2026-06-27

Two full stack developers split ownership by domain:

- **Alex — Infrastructure & Commerce**: database, migrations, deploy engine, Stripe, entitlements, security hardening
- **Tomas — Experience & Integration**: dashboard UI, routing, Portfolio CMS, analytics dashboards, public API surfaces

Both devs work on every phase. The split below is by primary ownership — the owner drives the implementation and review; the other contributes as needed.

---

## Milestone A — Safe Base

### Phase 0 — Stabilise current repository

| Task | Owner |
|------|-------|
| Add `PATCH` to Fastify CORS | Alex |
| Global request ID generation + add to logs and audit entries | Alex |
| `GET /api/server/schema` endpoint | Alex |
| `GET /api/server/features` endpoint | Alex |
| Global API error response shape | Alex |
| Stricter JSON payload-size defaults | Alex |
| Pagination defaults and maximums | Alex |
| SQLite-in-production warning | Alex |
| Feature flag helper for V4 gates | Alex |
| `schema_migrations` table + migration runner skeleton | Alex |
| Stop using silent `ALTER TABLE` blocks for new schema | Alex |
| Test-only migration reset utility | Alex |
| `jobs` table, in-process runner (disabled by default), lock/unlock, retry/backoff | Alex |
| Confirm host-protection invariants (concurrency caps, disk admission, upload limits, cache headers, container limits) | Alex |
| Tests: CORS PATCH, schema endpoint, feature flags, migration runner, job table | Alex |
| Job dashboard placeholder under Server | Tomas |
| Pagination controls on existing list views | Tomas |

### Phase 0.5 — Baseline snapshot and namespace lock

| Task | Owner |
|------|-------|
| Commit baseline report (tests, lint, API route list, SQLite schema dump, Caddy inventory, Docker labels, backup dry run, feature flags) | Tomas |
| Namespace boundary tests (`/api/public/*`, `/api/ingest/*`, `/api/webhooks/*`, admin routes) | Tomas |
| Document namespace strategy | Tomas |
| Deprecation header helper (ready to apply once V4 replacements exist) | Tomas |

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
| Tests: connection, migration order, checksum, failure, backup includes PG, restore dry run, SQLite legacy mode | Alex |

---

## Milestone B — V4 Operational Core

### Phase 2 — Introduce V4 Products/Systems model

| Task | Owner |
|------|-------|
| New tables: `products`, `systems`, `system_environments`, `releases`, `domains`, `environment_secrets`, `infrastructure_metrics`, `health_snapshots`, `legacy_project_map` | Alex |
| Migration bridge: `projects → legacy_project_map → systems → production env → release → domain` | Alex |
| Field mapping script (name, slug, deploy_type, status, repo, visibility, health_path, container_id, port, previous_*, etc.) | Alex |
| Read APIs: `GET /api/systems`, `/api/systems/:id`, `/api/systems/:id/environments`, `/api/systems/:id/releases`, `GET /api/products`, `/api/products/:id` | Alex |
| Write APIs: `POST /api/systems`, `PATCH /api/systems/:id`, `POST /api/products`, `PATCH /api/products/:id` | Alex |
| Legacy API compatibility layer (`GET /api/projects` reads from V4 tables when `ENABLE_V4_SYSTEMS=true`) | Alex |
| Tests: project-to-system migration, legacy API still works, systems API returns migrated projects, health/stats/route mapping | Alex |
| Dashboard Systems page renders V4-backed systems through same visual layout | Tomas |
| Hidden admin/test Product page | Tomas |

### Phase 2.5 — Migration reconciliation checkpoint

| Task | Owner |
|------|-------|
| `api/scripts/reconcile-v4-migration.js` (verifies every project → system mapping, containers → releases, routes → domains, encrypted vars, history rows, backup coverage) | Tomas |
| Operator dashboard report: mapped/unmapped projects, orphan containers/routes, missing domains/releases, decryption failures, backup coverage status | Tomas |

### Phase 3 — Move deploy engine to Systems/Environments

| Task | Owner |
|------|-------|
| New deployment routes: `POST /api/systems/:id/environments/:env/deploy|redeploy|rollback`, `GET /api/systems/:id/environments/:env/logs|stats` | Alex |
| Legacy routes (`POST /api/deploy`, `POST /api/projects/:slug/redeploy|rollback`) wired through mapping layer | Alex |
| Extract `deployService`: `detect`, `extract`, `build`, `runContainer`, `verifyHealth`, `recordRelease`, `publishRoute`, `rollback` | Alex |
| Docker container labels: `systems.organisation_id`, `system_id`, `environment_id`, `release_id`, `slug`, `environment` | Alex |
| Backend support for `production` + `preview` environments | Alex |
| `POST /api/systems/:id/promote` with full promotion flow (health pass → container start → route switch → retain previous → record release) | Alex |
| Tests: new deploy route, legacy deploy route, container labels, preview/production isolation, promotion health gate, rollback, failed deploy safety | Alex |

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

---

## Milestone D — Paid Products

### Phase 6 — Commerce foundation

| Task | Owner |
|------|-------|
| Commerce tables: `offers`, `customers`, `orders`, `subscriptions`, `payment_webhook_events`, `checkout_disclosures` | Alex |
| Stripe Checkout integration | Alex |
| Stripe Customer Portal integration | Alex |
| Signed Stripe webhook endpoint with idempotency | Alex |
| Manual order + complimentary order creation | Alex |
| Subscription state mirroring from Stripe (`trialing`, `active`, `past_due`, `cancel_at_period_end`, `cancelled`, `expired`) | Alex |
| Reconciliation jobs: `stripe.reconcile.checkout_sessions`, `subscriptions`, `invoices`, `entitlements` | Alex |
| Capture per-checkout: terms version, privacy version, withdrawal consent, marketing consent, locale, billing country, VAT evidence | Alex |
| Tests: checkout session creation, webhook signature verification, duplicate webhook dedup, subscription lifecycle, manual order audit, disclosure capture | Alex |
| Checkout flow UI (product page → create session → Stripe Checkout → confirmation page) | Tomas |
| Legal/compliance capture UI (consent checkboxes, withdrawal consent, marketing consent) | Tomas |
| Orders and subscriptions dashboard views | Tomas |

### Phase 7 — Entitlements, product keys and licensing

| Task | Owner |
|------|-------|
| Entitlement tables: `entitlement_grants`, `entitlement_revocations`, `entitlement_resolution_snapshots`, `effective_entitlements`, `licences`, `licence_activations`, `entitlement_events`, `licence_events`, `licence_signing_keys` | Alex |
| Entitlement grant resolver (handles lifetime purchase + subscription, grace access, refund overlap, upgrade/downgrade, admin grants) | Alex |
| Product-key generation (high entropy, store hash only, raw key shown only at creation/redemption, revocation, replacement, activation limits, full audit) | Alex |
| APIs: `POST /api/entitlements/check|admin/grant|admin/revoke`, `POST /api/licensing/redeem|activate|validate|deactivate` | Alex |
| Signed licence leases (`validUntil`, `offlineUntil`, `features`, subscription state, signature) | Alex |
| Licence signing-key management: table, current/previous key support, key ID in leases, public-key endpoint, revocation-list endpoint, emergency key-rotation runbook | Alex |
| Full subscription state machine: `active → payment_failed → past_due → grace → suspended → recovered|cancelled|expired|refunded|chargeback|manual_revoked` — all 13 states with distinct behaviour | Alex |
| Payment recovery and reactivation workflows (Stripe retry, self-serve update, admin reactivate, data restoration on reactivation) | Alex |
| Grace policy per offer: configurable grace duration, full vs. read-only access during grace | Alex |
| Email fulfilment: purchase confirmation, redemption link, billing portal link, licence activation instructions, support link | Alex |
| Tests: one-time purchase creates perpetual entitlement, subscription creates renewable entitlement, duplicate webhook dedup, refund/chargeback revocation, key redemption once, activation limit, signed lease, expired subscription grace/suspension, SYSTEMS outage offline lease | Alex |
| Licence redemption UI | Tomas |
| Admin entitlement grant/revoke UI | Tomas |
| Customer account area (subscription status, active licences, billing portal link) | Tomas |
| Subscription state display with grace/suspension indicators | Tomas |

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
| Entitlement resolver: full multi-grant (order + subscription + trial + manual + promo overlap), cancelling one source must not revoke access from another | Alex |
| Effective state machine: `pending`, `trial`, `active`, `grace`, `read_only`, `suspended`, `expired`, `denied` | Alex |
| Offline signed licence leases: Ed25519 asymmetric signing, clock-rollback detection, `offlineUntil`, degraded/read-only access modes | Alex |
| Device activations: privacy-minimised device ID, activation limits, self-service reset | Alex |
| Seats: assignable units within multi-user entitlements, invitation and release flows | Alex |
| Integration webhook delivery: signed outbound webhooks on access changes, retry with exponential backoff, idempotency, dead-letter routing | Alex |
| New APIs: `POST /api/identity/authorize`, `POST /api/identity/token`, `POST /api/product-users/upsert`, `POST /api/product-users/link-account`, `POST /api/entitlements/batch-check`, `POST /api/integration-webhooks/acknowledge` | Alex |
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

### Phase 8.5 — App Builder Framework and SDKs

| Task | Owner |
|------|-------|
| `systems.app.json` manifest schema definition (`schema: systems.app.v4`) and server-side validation tooling | Alex |
| App acceptance level definitions and enforcement at deploy time: Level 0 (static), 1 (managed web), 2 (commercial), 3 (licensed/subscription), 4 (external), 5 (fully native) | Alex |
| Build detection and framework inference (Dockerfile, static output dir, supported frameworks) | Alex |
| Health/ready/version endpoint contract enforcement: `GET /api/health`, `GET /api/ready`, `GET /api/version` | Alex |
| Smoke test framework: run `scripts/systems-smoke-test.*` after deploy, gate release on result | Alex |
| Integration testing harness and 41-item acceptance checklist validation | Alex |
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

### Phase 9 — Hardening, operations and launch readiness

| Task | Owner |
|------|-------|
| RBAC roles: owner/admin/operator/commerce/viewer | Alex |
| TOTP enforced option | Alex |
| Session revocation | Alex |
| Secret write-only UI (write but never display raw) | Alex |
| Integration key hashing | Alex |
| Licence signing key rotation runbook + tooling | Alex |
| Stripe webhook signing enforcement | Alex |
| Media quarantine pipeline: SVG/script sanitization, malware detection/rejection, content-type verification by bytes, responsive variant generation, focal point + alt-text recording, metadata stripping | Alex |
| Emergency controls: revoke all sessions, disable/rotate all credentials, freeze deployments and publishing, quarantine product routes, activate maintenance mode | Alex |
| Structured observability: JSON logging standard, request ID correlation across checkout/webhook/deployment, latency/error rate metrics, secret redaction rules, product key non-logging enforcement | Alex |
| Public API allowlist automated enforcement and audit (no container IDs, ports, repo URLs, logs, admin IDs, customer/billing data, secret names) | Alex |
| Admin audit coverage audit (every dangerous action has an audit event) | Alex |
| Rate limits per route class | Alex |
| Backup/restore reliability drill: PostgreSQL, Caddy, media, portfolio snapshot, commerce, entitlement, licence, jobs | Alex |
| `V4_DEPLOY_RUNBOOK.md`, `V4_ROLLBACK_RUNBOOK.md`, `V4_STRIPE_INCIDENT_RUNBOOK.md`, `V4_ENTITLEMENT_RECOVERY_RUNBOOK.md`, `V4_BACKUP_RESTORE_RUNBOOK.md` | Alex |
| `V4_LICENSING_KEY_ROTATION_RUNBOOK.md`, `V4_DEVICE_RESET_RUNBOOK.md`, `V4_APP_INTEGRATION_RUNBOOK.md` | Alex |
| Load and resource protection testing: large upload cap, build concurrency, disk admission, container memory/CPU limits, analytics event flood, webhook burst, public catalog cache, renderer last-known-good | Tomas |
| Legal/compliance launch gate coordination (terms, privacy, cookie policy, withdrawal flow, subscription cancellation wording, VAT/accounting, refund/complaints, GDPR export/delete, accessibility) | Tomas |
| `V4_DOMAIN_RECOVERY_RUNBOOK.md`, `V4_SECURITY_INCIDENT_RUNBOOK.md` | Tomas |
| Launch rehearsal: deploy portfolio renderer, publish SK/EN snapshot, deploy test product, create offer, Stripe test purchase, create entitlement, redeem licence, simulate failed payment, simulate recovery, simulate refund, restore backup on clean machine, roll back product release, roll back portfolio snapshot | Tomas |

---

## Ownership summary

| Phase | Primary Alex | Primary Tomas |
|-------|--------------|--------------|
| 0 | Backend hardening, migration runner, jobs | Job UI placeholder, pagination UI |
| 0.5 | — | Baseline report, namespace tests |
| 1 | PostgreSQL foundation, all migration tooling | — |
| 2 | DB tables, migration bridge, all APIs | Systems/Products dashboard display |
| 2.5 | — | Reconciliation script, operator report |
| 3 | Full deploy engine refactor | — |
| 4 | Caddy service, domain verification backend | Domain management UI, maintenance UI |
| 5 | Public catalog API, acronym.sk deployment | Portfolio CMS, snapshot pipeline, renderer |
| 6 | Commerce backend, Stripe, reconciliation jobs | Checkout UI, compliance capture UI |
| 7 | Entitlements, licences, signing keys, emails | Customer UI, admin grant/revoke UI |
| 7.5 | OIDC/BYOI identity, multi-grant resolver, offline leases, devices, seats, integration webhooks | Customers dashboard area, admin entitlement actions UI, SDK docs |
| 8 | Integration keys, ingestion, aggregation jobs | Analytics dashboards, integration key UI |
| 8.5 | Manifest schema, acceptance levels, smoke test, server SDK, CLI | App certification UI, browser SDK, developer docs |
| 9 | RBAC, hardening, media quarantine, emergency controls, observability, backup drills, runbooks | Load testing, legal gates, launch rehearsal |

---

## Cross-cutting rules (both devs)

- Every phase must exit with its feature flag gating new behaviour.
- A phase is not done without tests, rollback documentation, and audit events for dangerous actions.
- Never silent-swallow errors (`try { } catch {}`).
- PR size: one migration + one repository + one route group + tests.
- Never mix schema + dashboard + deploy engine + Stripe in one PR.
