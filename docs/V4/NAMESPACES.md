# SYSTEMS. V4 — API namespace strategy (Phase 0.5 lock)

**Status:** locked  
**Enforced by:** `api/test/namespaces.test.js` (boundary tests run in CI)  
**Source:** `SYSTEMS_V4_IMPLEMENTATION_ROADMAP_FIXED.md` §4.1

## Rules

1. Everything lives under `/api/...`. No `/v1/...`, no `/api/v4/...` —
   versioning belongs in payload schemas (e.g. `systems.event.v1`), never in
   the URL path.
2. Each namespace has exactly one auth class. Admin cookies must never unlock
   public, ingestion or webhook namespaces, and integration keys must never
   unlock admin namespaces.
3. Namespaces that do not exist yet must stay completely dark (404, no
   cookies) until their owning phase ships them behind a feature flag.
4. When a V4 replacement for a legacy route goes live, the legacy route gains
   deprecation headers via `api/src/util/deprecation.js` — it is not removed.

## Canonical namespaces and auth classes

| Namespace | Auth class | Status |
|---|---|---|
| `/api/auth/*` | anonymous → session issue | live |
| `/api/projects/*`, `/api/deploy`, `/api/upload/*` | admin session | live (legacy, kept until V4 launch) |
| `/api/admin/*`, `/api/server/*`, `/api/audit/*` | admin session | live |
| `/api/webhook/github` | HMAC signature (flag-gated) | live (legacy path; V4 moves provider hooks under `/api/webhooks/*`) |
| `/api/products/*` | admin session | Phase 2 |
| `/api/systems/*` | admin session | Phase 2/3 |
| `/api/portfolio/*` | admin session | Phase 5 |
| `/api/public/*` | none (allowlisted fields only, cache-classified) | Phase 5 |
| `/api/commerce/*` | admin session | Phase 6 |
| `/api/customers/*` | admin session | Phase 6/7.5 |
| `/api/entitlements/*` | integration key / admin (per route) | Phase 7 |
| `/api/licensing/*` | licence/integration key | Phase 7 |
| `/api/webhooks/*` | provider signature (Stripe, GitHub) | Phase 6+ |
| `/api/identity/*` | OIDC flows | Phase 7.5 |
| `/api/ingest/*` | integration key | Phase 8 |
| `/api/analytics/*` | admin session | Phase 8 |
| `/api/integrations/*` | admin session | Phase 8 |

## Boundary contracts tested today

- Future namespaces (`/api/public/*`, `/api/ingest/*`, `/api/webhooks/*`,
  `/api/systems`, `/api/products`, `/api/commerce/*`) return the canonical
  404 envelope and never set cookies.
- An authenticated admin session does **not** unlock `/api/ingest/*` or
  `/api/webhooks/*`.
- `/api/admin/*` rejects anonymous requests (401).
- Legacy `/api/projects` remains admin-gated and functional.
- The legacy GitHub webhook never accepts an unsigned event.

When a phase ships one of these namespaces, extend `namespaces.test.js` with
that namespace's positive auth contract — do not delete the dark-namespace
assertions, convert them.
