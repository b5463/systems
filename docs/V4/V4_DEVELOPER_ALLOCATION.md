# SYSTEMS. V4 — Developer Allocation

**Status:** Active  
**Branch:** `claude/v4-roadmap-allocation-jxue3e`  
**Updated:** 2026-06-27

Two full stack developers split ownership by domain:

- **Dev 1 — Infrastructure & Commerce**: database, migrations, deploy engine, Stripe, entitlements, security hardening
- **Dev 2 — Experience & Integration**: dashboard UI, routing, Portfolio CMS, analytics dashboards, public API surfaces

Both devs work on every phase. The split below is by primary ownership — the owner drives the implementation and review; the other contributes as needed.

---

## Milestone A — Safe Base

### Phase 0 — Stabilise current repository

| Task | Owner |
|------|-------|
| Add `PATCH` to Fastify CORS | Dev 1 |
| Global request ID generation + add to logs and audit entries | Dev 1 |
| `GET /api/server/schema` endpoint | Dev 1 |
| `GET /api/server/features` endpoint | Dev 1 |
| Global API error response shape | Dev 1 |
| Stricter JSON payload-size defaults | Dev 1 |
| Pagination defaults and maximums | Dev 1 |
| SQLite-in-production warning | Dev 1 |
| Feature flag helper for V4 gates | Dev 1 |
| `schema_migrations` table + migration runner skeleton | Dev 1 |
| Stop using silent `ALTER TABLE` blocks for new schema | Dev 1 |
| Test-only migration reset utility | Dev 1 |
| `jobs` table, in-process runner (disabled by default), lock/unlock, retry/backoff | Dev 1 |
| Confirm host-protection invariants (concurrency caps, disk admission, upload limits, cache headers, container limits) | Dev 1 |
| Tests: CORS PATCH, schema endpoint, feature flags, migration runner, job table | Dev 1 |
| Job dashboard placeholder under Server | Dev 2 |
| Pagination controls on existing list views | Dev 2 |

### Phase 0.5 — Baseline snapshot and namespace lock

| Task | Owner |
|------|-------|
| Commit baseline report (tests, lint, API route list, SQLite schema dump, Caddy inventory, Docker labels, backup dry run, feature flags) | Dev 2 |
| Namespace boundary tests (`/api/public/*`, `/api/ingest/*`, `/api/webhooks/*`, admin routes) | Dev 2 |
| Document namespace strategy | Dev 2 |
| Deprecation header helper (ready to apply once V4 replacements exist) | Dev 2 |

### Phase 1 — PostgreSQL and migration foundation

| Task | Owner |
|------|-------|
| `api/src/db/postgres.js` and `sqlite-legacy.js` | Dev 1 |
| `api/src/db/repositories/` structure | Dev 1 |
| `api/src/db/migrate.js` runner | Dev 1 |
| `api/src/db/migrations/` directory with first foundational tables (`schema_migrations`, `organisations`, `admin_users`, `admin_sessions`, `platform_settings`, `audit_log_v4`, `jobs`) | Dev 1 |
| Environment vars: `SYSTEMS_DB_ENGINE`, `DATABASE_URL`, `MIGRATIONS_AUTO_RUN` | Dev 1 |
| Migration scripts: `migrate-sqlite-to-postgres.js`, `verify-postgres-migration.js`, Windows PowerShell equivalents | Dev 1 |
| Repository facades: `usersRepository`, `settingsRepository`, `auditRepository`, `jobsRepository` | Dev 1 |
| Extend backup/restore scripts to include PostgreSQL `pg_dump`, migration state, job table, platform settings, audit | Dev 1 |
| Tests: connection, migration order, checksum, failure, backup includes PG, restore dry run, SQLite legacy mode | Dev 1 |

---

## Milestone B — V4 Operational Core

### Phase 2 — Introduce V4 Products/Systems model

| Task | Owner |
|------|-------|
| New tables: `products`, `systems`, `system_environments`, `releases`, `domains`, `environment_secrets`, `infrastructure_metrics`, `health_snapshots`, `legacy_project_map` | Dev 1 |
| Migration bridge: `projects → legacy_project_map → systems → production env → release → domain` | Dev 1 |
| Field mapping script (name, slug, deploy_type, status, repo, visibility, health_path, container_id, port, previous_*, etc.) | Dev 1 |
| Read APIs: `GET /api/systems`, `/api/systems/:id`, `/api/systems/:id/environments`, `/api/systems/:id/releases`, `GET /api/products`, `/api/products/:id` | Dev 1 |
| Write APIs: `POST /api/systems`, `PATCH /api/systems/:id`, `POST /api/products`, `PATCH /api/products/:id` | Dev 1 |
| Legacy API compatibility layer (`GET /api/projects` reads from V4 tables when `ENABLE_V4_SYSTEMS=true`) | Dev 1 |
| Tests: project-to-system migration, legacy API still works, systems API returns migrated projects, health/stats/route mapping | Dev 1 |
| Dashboard Systems page renders V4-backed systems through same visual layout | Dev 2 |
| Hidden admin/test Product page | Dev 2 |

### Phase 2.5 — Migration reconciliation checkpoint

| Task | Owner |
|------|-------|
| `api/scripts/reconcile-v4-migration.js` (verifies every project → system mapping, containers → releases, routes → domains, encrypted vars, history rows, backup coverage) | Dev 2 |
| Operator dashboard report: mapped/unmapped projects, orphan containers/routes, missing domains/releases, decryption failures, backup coverage status | Dev 2 |

### Phase 3 — Move deploy engine to Systems/Environments

| Task | Owner |
|------|-------|
| New deployment routes: `POST /api/systems/:id/environments/:env/deploy|redeploy|rollback`, `GET /api/systems/:id/environments/:env/logs|stats` | Dev 1 |
| Legacy routes (`POST /api/deploy`, `POST /api/projects/:slug/redeploy|rollback`) wired through mapping layer | Dev 1 |
| Extract `deployService`: `detect`, `extract`, `build`, `runContainer`, `verifyHealth`, `recordRelease`, `publishRoute`, `rollback` | Dev 1 |
| Docker container labels: `systems.organisation_id`, `system_id`, `environment_id`, `release_id`, `slug`, `environment` | Dev 1 |
| Backend support for `production` + `preview` environments | Dev 1 |
| `POST /api/systems/:id/promote` with full promotion flow (health pass → container start → route switch → retain previous → record release) | Dev 1 |
| Tests: new deploy route, legacy deploy route, container labels, preview/production isolation, promotion health gate, rollback, failed deploy safety | Dev 1 |

### Phase 4 — Domains, routing, access and maintenance

| Task | Owner |
|------|-------|
| `domains`, `maintenance_windows`, `route_publication_attempts` tables | Dev 1 |
| Domain-driven Caddy `renderRoute()` service (hostname, upstream, access policy, basic auth, canonical redirect, maintenance, attestation) | Dev 1 |
| Route publication transaction: write pending → validate Caddy config → reload → probe → mark active | Dev 1 |
| Custom domain verification flow: add hostname → generate token → DNS instructions → verify TXT/CNAME/A → publish → check TLS → canonical selection | Dev 1 |
| Tests: default subdomain, private system, password route, reload failure safety, custom domain without verification blocked, canonical redirect, maintenance mode route | Dev 1 |
| Domain management UI in dashboard | Dev 2 |
| Custom domain add/verify wizard UI | Dev 2 |
| Maintenance mode UI controls | Dev 2 |
| Canonical redirect configuration UI | Dev 2 |

---

## Milestone C — Acronym Public Portfolio

### Phase 5 — Portfolio CMS and Acronym public renderer

| Task | Owner |
|------|-------|
| `GET /api/public/catalog?locale=sk|en`, `GET /api/public/products/:slug?locale=sk`, `GET /api/public/snapshot/latest?locale=en` | Dev 1 |
| Public API field allowlist enforcement (no container IDs, ports, repo URLs, logs, internal routes, admin IDs, customer/billing data, secret names) | Dev 1 |
| Deploy `acronym.sk` as first primary V4 system | Dev 1 |
| Portfolio tables: `portfolio_pages`, `product_portfolio_profiles`, `portfolio_blocks`, `portfolio_snapshots`, `portfolio_redirects`, `public_forms`, `form_submissions`, `lead_status`, `media_assets`, `legal_versions` | Dev 2 |
| Draft CMS → validation → preview snapshot → publish → immutable snapshot pipeline | Dev 2 |
| Dashboard Portfolio area: homepage editor, navigation editor, product-page editor, media library, legal pages, redirects, locales, preview, publish history, snapshot rollback | Dev 2 |
| SK/EN locale support: localised slugs, SEO, language switch mapping, translation completeness indicator, fallback rules, localised legal pages | Dev 2 |
| `acronym.sk` renderer: pre-rendered pages, snapshot cache, last-known-good snapshot, ETag, stale-while-revalidate, hashed assets, no live DB dependency | Dev 2 |
| Tests: draft change does not alter public site, publish creates immutable snapshot, snapshot rollback, SK/EN render, missing translation visible, public API hides private fields, renderer works during SYSTEMS API outage | Dev 2 |

---

## Milestone D — Paid Products

### Phase 6 — Commerce foundation

| Task | Owner |
|------|-------|
| Commerce tables: `offers`, `customers`, `orders`, `subscriptions`, `payment_webhook_events`, `checkout_disclosures` | Dev 1 |
| Stripe Checkout integration | Dev 1 |
| Stripe Customer Portal integration | Dev 1 |
| Signed Stripe webhook endpoint with idempotency | Dev 1 |
| Manual order + complimentary order creation | Dev 1 |
| Subscription state mirroring from Stripe (`trialing`, `active`, `past_due`, `cancel_at_period_end`, `cancelled`, `expired`) | Dev 1 |
| Reconciliation jobs: `stripe.reconcile.checkout_sessions`, `subscriptions`, `invoices`, `entitlements` | Dev 1 |
| Capture per-checkout: terms version, privacy version, withdrawal consent, marketing consent, locale, billing country, VAT evidence | Dev 1 |
| Tests: checkout session creation, webhook signature verification, duplicate webhook dedup, subscription lifecycle, manual order audit, disclosure capture | Dev 1 |
| Checkout flow UI (product page → create session → Stripe Checkout → confirmation page) | Dev 2 |
| Legal/compliance capture UI (consent checkboxes, withdrawal consent, marketing consent) | Dev 2 |
| Orders and subscriptions dashboard views | Dev 2 |

### Phase 7 — Entitlements, product keys and licensing

| Task | Owner |
|------|-------|
| Entitlement tables: `entitlement_grants`, `entitlement_revocations`, `entitlement_resolution_snapshots`, `effective_entitlements`, `licences`, `licence_activations`, `entitlement_events`, `licence_events`, `licence_signing_keys` | Dev 1 |
| Entitlement grant resolver (handles lifetime purchase + subscription, grace access, refund overlap, upgrade/downgrade, admin grants) | Dev 1 |
| Product-key generation (high entropy, store hash only, raw key shown only at creation/redemption, revocation, replacement, activation limits, full audit) | Dev 1 |
| APIs: `POST /api/entitlements/check|admin/grant|admin/revoke`, `POST /api/licensing/redeem|activate|validate|deactivate` | Dev 1 |
| Signed licence leases (`validUntil`, `offlineUntil`, `features`, subscription state, signature) | Dev 1 |
| Licence signing-key management: table, current/previous key support, key ID in leases, public-key endpoint, revocation-list endpoint, emergency key-rotation runbook | Dev 1 |
| Subscription access grace/suspension flow (`active → payment failed → past_due → grace → suspended → recovered|cancelled`) | Dev 1 |
| Email fulfilment: purchase confirmation, redemption link, billing portal link, licence activation instructions, support link | Dev 1 |
| Tests: one-time purchase creates perpetual entitlement, subscription creates renewable entitlement, duplicate webhook dedup, refund/chargeback revocation, key redemption once, activation limit, signed lease, expired subscription grace/suspension, SYSTEMS outage offline lease | Dev 1 |
| Licence redemption UI | Dev 2 |
| Admin entitlement grant/revoke UI | Dev 2 |
| Customer account area (subscription status, active licences, billing portal link) | Dev 2 |
| Subscription state display with grace/suspension indicators | Dev 2 |

---

## Milestone E — Intelligence and Launch

### Phase 8 — Product analytics and external integrations

| Task | Owner |
|------|-------|
| `integration_keys` and `integration_key_events` tables | Dev 1 |
| Integration key scopes: `heartbeat:write`, `events:write`, `errors:write`, `releases:write`, `metrics:write`, `entitlements:check`, `licences:validate` | Dev 1 |
| Ingestion endpoints: `POST /api/ingest/heartbeat|releases|errors|events|metrics` | Dev 1 |
| Event storage tables: `product_events`, `product_metric_hourly`, `product_metric_daily`, `error_groups`, `release_reports`, `external_heartbeats` | Dev 1 |
| Aggregation jobs: `analytics.aggregate.hourly`, `analytics.aggregate.daily`, `analytics.compact.raw`, `analytics.retention.cleanup` | Dev 1 |
| Rate-limiting and payload size caps on ingestion endpoints | Dev 1 |
| Tests: bad key rejected, scoped key access enforcement, event size cap, heartbeat updates system health, release report in dashboard, daily metric aggregation, high-volume rate limiting, analytics failure isolation from entitlement checks | Dev 1 |
| Integration key management UI (create, rotate, revoke) | Dev 2 |
| Analytics dashboard (product metrics, operational metrics — separated) | Dev 2 |
| Error groups UI | Dev 2 |
| Release reports UI | Dev 2 |
| External system health display | Dev 2 |
| Event volume monitoring display | Dev 2 |

### Phase 9 — Hardening, operations and launch readiness

| Task | Owner |
|------|-------|
| RBAC roles: owner/admin/operator/commerce/viewer | Dev 1 |
| TOTP enforced option | Dev 1 |
| Session revocation | Dev 1 |
| Secret write-only UI (write but never display raw) | Dev 1 |
| Integration key hashing | Dev 1 |
| Licence signing key rotation runbook + tooling | Dev 1 |
| Stripe webhook signing enforcement | Dev 1 |
| Media quarantine | Dev 1 |
| Public API allowlist audit | Dev 1 |
| Admin audit coverage audit | Dev 1 |
| Rate limits per route class | Dev 1 |
| Backup/restore reliability drill: PostgreSQL, Caddy, media, portfolio snapshot, commerce, entitlement, licence, jobs | Dev 1 |
| `V4_DEPLOY_RUNBOOK.md`, `V4_ROLLBACK_RUNBOOK.md`, `V4_STRIPE_INCIDENT_RUNBOOK.md`, `V4_ENTITLEMENT_RECOVERY_RUNBOOK.md`, `V4_BACKUP_RESTORE_RUNBOOK.md` | Dev 1 |
| Load and resource protection testing: large upload cap, build concurrency, disk admission, container memory/CPU limits, analytics event flood, webhook burst, public catalog cache, renderer last-known-good | Dev 2 |
| Legal/compliance launch gate coordination (terms, privacy, cookie policy, withdrawal flow, subscription cancellation wording, VAT/accounting, refund/complaints, GDPR export/delete, accessibility) | Dev 2 |
| `V4_DOMAIN_RECOVERY_RUNBOOK.md`, `V4_SECURITY_INCIDENT_RUNBOOK.md` | Dev 2 |
| Launch rehearsal: deploy portfolio renderer, publish SK/EN snapshot, deploy test product, create offer, Stripe test purchase, create entitlement, redeem licence, simulate failed payment, simulate recovery, simulate refund, restore backup on clean machine, roll back product release, roll back portfolio snapshot | Dev 2 |

---

## Ownership summary

| Phase | Primary Dev 1 | Primary Dev 2 |
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
| 8 | Integration keys, ingestion, aggregation jobs | Analytics dashboards, integration key UI |
| 9 | RBAC, hardening, backup drills, ops runbooks | Load testing, legal gates, launch rehearsal |

---

## Cross-cutting rules (both devs)

- Every phase must exit with its feature flag gating new behaviour.
- A phase is not done without tests, rollback documentation, and audit events for dangerous actions.
- Never silent-swallow errors (`try { } catch {}`).
- PR size: one migration + one repository + one route group + tests.
- Never mix schema + dashboard + deploy engine + Stripe in one PR.
