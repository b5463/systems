# SYSTEMS. V4 — Phase 2 status (Products/Systems data model)

**Branch:** `claude/v4-roadmap-alexes-tasks-yhg4qi`
**Scope:** Phase 2 engineering tasks from `V4_DEVELOPER_ALLOCATION.md`.
**Updated:** 2026-07-02

---

## Implemented in this changeset

| Task | Where |
|---|---|
| Nine V4 tables | Migration `20260702150000_v4_phase2_products_systems`: `products`, `systems`, `system_environments`, `releases`, `domains`, `environment_secrets`, `infrastructure_metrics`, `health_snapshots`, `legacy_project_map` — all org-scoped, UUID keys, composite indexes in the same migration; SQL generated from the Prisma schema (zero drift by construction) |
| Migration bridge | `api/scripts/migrate-projects-to-v4.js`: projects → legacy_project_map → systems → production/preview environment → current release (+ superseded previous release when rollback data exists) → default `{slug}.BASE_DOMAIN` domain. Idempotent (mapped projects skipped), non-destructive (legacy tables never written), full roadmap field mapping |
| Repositories | `api/src/repo/products.js`, `api/src/repo/systems.js` — every method takes `organisationId` first and filters on it; system creation always creates its production environment |
| Read APIs | `GET /api/systems`, `/:id`, `/:id/environments`, `/:id/releases`, `GET /api/products`, `/:id` — behind `ENABLE_V4_SYSTEMS` / `ENABLE_V4_PRODUCTS` (flag off → canonical 404, per the Phase 0.5 namespace contract) |
| Write APIs | `POST/PATCH /api/systems`, `POST/PATCH /api/products` — slug validation, duplicate → 409, rate-limited creates, every write appends an org-scoped v4 audit event |
| Legacy compatibility | `GET /api/projects` and `/api/projects/:slug` overlay the V4-owned core fields from the V4 tables when `ENABLE_V4_SYSTEMS` is on (`api/src/util/v4compat.js`); fields V4 does not own yet (health, github state, limits, blue/green) still come from the legacy row. Parity test asserts byte-identical responses flag-off vs flag-on |
| Org-scoping enforcement | Repo convention + `api/scripts/lint-org-scoping.js` wired into `npm run lint` (and therefore CI): raw SQL naming a scoped table must contain `organisation_id`; Prisma calls on scoped models must reference `organisationId`; justified exceptions carry `// org-scope-exempt: <reason>` annotations |
| Acceptance tests | Org A cannot read/update org B systems or products by ID or slug — proven at the repo layer and over HTTP (direct ID manipulation → 404, data untouched) |
| Dashboard | Systems page renders V4-backed data through the unchanged legacy contract (compat layer, parity-tested). Hidden `/products` admin/test page (no nav entry) exercising the products API |
| Tests | `api/test/v4-phase2.test.js` (8 tests): bridge field mapping, idempotency, compat parity, flag gating, CRUD + audit + slug conflicts, cross-org isolation |

## Deliberately NOT done (later phases, per roadmap)

- Deploy engine still targets `projects` — Phase 3
- No preview-environment UI, no promote flow — Phase 3
- `route_published` stays a boolean; `route_status` enum + junction table — Phase 4
- No portfolio/commerce/licensing surfaces
- Legacy `projects` remains the operational source of truth; the V4 copy is
  refreshed by re-running the bridge (drift reconciliation is Phase 2.5)

## Exit-gate checklist (current state)

- [x] All migrated projects visible as systems (verified on test data)
- [x] Legacy project API still works (byte-identical parity test)
- [x] Current deploy flow untouched
- [x] No route files changed by migration alone
- [x] Backup includes V4 tables (pg_dump covers the whole schema)
- [ ] Bridge executed against the production database (host action; run
      `node scripts/migrate-projects-to-v4.js`, then spot-check
      `/api/systems` against the dashboard)

## Rollback

Disable `ENABLE_V4_SYSTEMS` / `ENABLE_V4_PRODUCTS` (legacy reads revert
instantly — `projects` never stopped being the source of truth). V4 rows can
be left in place or cleared; the bridge recreates them.

## Next

Phase 2.5 — migration reconciliation checkpoint (`reconcile-v4-migration.js`
+ operator report), then Phase 3 — deploy engine on Systems/Environments.
