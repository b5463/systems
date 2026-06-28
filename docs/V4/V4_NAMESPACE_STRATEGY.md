# SYSTEMS. V4 — API Namespace Strategy

**Status:** Locked at Phase 0.5
**Enforced by:** `api/test/v4-namespace.test.js`

---

## Namespace map

All API routes live under `/api/`. The dashboard is served separately by the reverse proxy.

### Current namespaces (V2/V3)

| Prefix | Auth | Purpose | Route file |
|--------|------|---------|------------|
| `/api/admin/*` | Admin session | User management, IP bans, platform settings | `admin.js` |
| `/api/auth/*` | Mixed | Login (public), session management (auth), API tokens (auth) | `auth.js`, `tokens.js` |
| `/api/audit/*` | Admin session | Audit log queries and chain verification | `audit.js` |
| `/api/deploy/*` | Admin session | Deploy plan, analyze, execute, redeploy | `deploy.js` |
| `/api/projects/*` | Admin session | System CRUD, lifecycle, secrets, env, stats, logs | `projects.js`, `secrets.js`, `logs.js`, `stats.js`, `env.js`, `exec.js` |
| `/api/server/*` | Admin session | Infrastructure status, schema, features, backup, cleanup | `server.js` |
| `/api/webhook/*` | Signature / none | Inbound webhooks (GitHub push) | `webhook.js` |
| `/api/internal/*` | None | Internal attestation (no auth, not public) | `attestation.js` |
| `/api/runtimes` | Admin session | Runtime listing | `buildpipeline.js` |
| `/api/backups/*` | Admin session | Backup listing and restore drills | `buildpipeline.js` |
| `/api/nodes/*` | Admin session | Multi-node management | `nodes.js` |
| `/api/previews/*` | Admin session | Preview environment listing and cleanup | `preview.js` |
| `/api/upload/*` | Admin session | Chunked file upload | `upload.js` |

### Reserved namespaces (V4)

These namespaces are reserved for V4 phases. Namespace boundary tests enforce that no routes exist under them until the relevant phase ships.

| Prefix | Phase | Purpose |
|--------|-------|---------|
| `/api/public/*` | Phase 5+ | Public-facing read-only APIs (portfolio catalog, product pages, signing keys) |
| `/api/ingest/*` | Phase 8 | Integration SDK ingestion endpoints (heartbeat, events, errors, metrics) |
| `/api/webhooks/*` | Phase 6 | V4 inbound webhooks (Stripe, integration partners) — distinct from `/api/webhook/` |

### Migration plan

| Current | V4 target | When |
|---------|-----------|------|
| `/api/projects/*` | `/api/systems/:id/environments/:env/*` | Phase 2–3 |
| `/api/deploy/*` | Merged into systems/environments routes | Phase 3 |
| `/api/webhook/github` | `/api/webhooks/github` | Phase 4 |
| `/api/internal/attestation/*` | Keep or deprecate | Phase 9 |

Legacy routes (`/api/projects/*`, `/api/deploy/*`) will remain functional through a compatibility layer until Phase 9. The deprecation header helper (`api/src/util/deprecation.js`) will be applied to legacy routes once their V4 replacements are live.

---

## Auth classes (V4 target)

Every route will be tagged with an auth class by Phase 7. Untagged routes will fail to register at startup.

| Class | Access | Example |
|-------|--------|---------|
| `public` | No auth | `/api/public/catalog`, `/api/public/signing-keys` |
| `integration` | API key (scoped) | `/api/ingest/*`, entitlement checks |
| `admin` | Admin session + CSRF | All current admin routes |
| `webhook` | Signature verification | `/api/webhooks/stripe` |
| `internal` | Network-only / none | `/api/internal/attestation/*` |

---

## Rules

1. All routes start with `/api/`
2. Route files are named after their namespace (`admin.js` for `/api/admin/*`)
3. Every route file that defines non-public routes must use `fastify.authenticate`
4. Reserved namespaces must stay empty until their phase ships
5. New namespaces require a test in `v4-namespace.test.js` before first use
6. Legacy routes get deprecation headers when V4 replacements are live — never before
7. No route path may contain double slashes

---

*This document is a Phase 0.5 exit gate artifact. Changes require updating both this document and the namespace boundary tests.*
