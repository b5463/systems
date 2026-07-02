# SYSTEMS. V4 — Phase 0.5 baseline snapshot

**Generated:** 2026-07-02T18:38:37.641Z  
**Generator:** `api/scripts/generate-baseline-report.js`  
**Rule:** anything the generating environment cannot observe is `not_measured` (ADR 0004).

## Test and lint state

- npm test: 187 tests: 186 pass, 0 fail, 1 skipped (e2e gate)
- npm run lint: clean (eslint src test scripts)

## Applied migrations (`_prisma_migrations`)

- `20260622220536_init`
- `20260622224039_blue_green`
- `20260628090000_v3_features`
- `20260702090000_v4_phase0_jobs_audit_request_id`
- `20260702130000_v4_phase1_foundational`

## Database tables

```text
_prisma_migrations
admin_sessions
admin_users
api_tokens
audit_log
audit_log_v4
backup_records
deploy_history
ip_bans
jobs
nodes
organisations
platform_settings
projects
secrets
sessions
stats_history
users
```

Full schema: [`schema.sql`](./schema.sql)

## API route tree

```text
├── /api/auth/2fa/setup (POST)
├── /api/auth/2fa/enable (POST)
├── /api/auth/2fa/disable (POST)
├── /api/auth/login (POST)
├── /api/auth/logout (POST)
├── /api/auth/me (GET, HEAD)
├── /api/auth/sessions (GET, HEAD)
│   └── /:id (DELETE)
├── /api/auth/change-password (POST)
├── /api/auth/revoke-sessions (POST)
├── /api/auth/refresh (POST)
├── /api/auth/tokens (POST, GET, HEAD)
│   └── /:id (DELETE)
├── /api/audit (GET, HEAD)
│   └── /verify (GET, HEAD)
├── /api/admin/users (GET, HEAD, POST)
│   └── /:id (DELETE)
│       └── /password (PATCH)
├── /api/admin/ip-bans (GET, HEAD, POST)
│   └── /:id (DELETE)
├── /api/admin/settings (GET, HEAD, PATCH)
├── /api/deploy (POST)
│   ├── /plan (POST)
│   ├── /analyze (POST)
│   ├── /:slug/redeploy (POST)
│   └── /:slug/build-log (GET, HEAD)
├── /api/projects (GET, HEAD)
│   └── /:slug (GET, HEAD, DELETE)
│       ├── /start (POST)
│       ├── /stats (GET, HEAD)
│       │   └── /history (GET, HEAD)
│       ├── /stop (POST)
│       ├── /secrets (GET, HEAD, PUT)
│       │   └── /:key (DELETE)
│       │       └── /rotate (POST)
│       ├── /restart (POST)
│       ├── /repo (PATCH)
│       ├── /rollback (POST)
│       ├── /runtime (PUT)
│       ├── /purge (POST)
│       ├── /publish-route (POST)
│       ├── /provision-db (POST)
│       ├── /primary (PATCH)
│       ├── /visibility (PATCH)
│       ├── /limits (PATCH)
│       ├── /logs (GET, HEAD)
│       │   └── /download (GET, HEAD)
│       ├── /health (POST)
│       ├── /deploy-history (GET, HEAD)
│       ├── /env (GET, HEAD, PUT)
│       └── /exec (GET, HEAD)
├── /api/previews (GET, HEAD)
│   └── /:slug (DELETE)
├── /api/server/info (GET, HEAD)
├── /api/server/backup (POST)
├── /api/server/cleanup (POST)
│   ├── /preview (GET, HEAD)
│   └── /prune (POST)
├── /api/server/notify-test (POST)
├── /api/server/schema (GET, HEAD)
├── /api/server/features (GET, HEAD)
├── /api/server/jobs (GET, HEAD)
├── /api/internal/attestation/:slug (GET, HEAD)
├── /api/webhook/github (POST)
│   └── /preview (POST)
├── /api/upload/init (POST)
├── /api/upload/:id (DELETE)
│   ├── /chunk (POST)
│   └── /complete (POST)
├── /api/nodes (GET, HEAD, POST)
│   └── /:id (PUT, DELETE)
│       └── /health (GET, HEAD)
├── /api/runtimes (GET, HEAD)
├── /api/backups (GET, HEAD)
│   └── /restore-drill (POST)
└── * (OPTIONS)
```

## Feature flags

- all gated features disabled (V2, V3 and V4 flags all default off)
- dbMode: `shared`

## Docker containers (managed=acronym-deploy)

- not_measured (Docker not observable from the generating environment)

## Caddy route files

- not_measured (CADDY_ROUTES_DIR not configured in the generating environment)

## Backup

- mechanism: pg_dump (custom format) + Caddy routes + manifest with `schema_version`
- scheduler: disabled (manual backup always available)
- object storage offload: disabled
