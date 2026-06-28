# SYSTEMS. V4 — Baseline Report

**Generated:** 2026-06-28
**Branch:** `claude/systems-v3-roadmap-check-xf56b6`
**Phase:** 0.5 — Baseline snapshot

This report captures the state of the codebase at the start of V4 development.
Compare against this snapshot to detect regressions during migration.

---

## 1. Test suite

| Metric | Value |
|--------|-------|
| Total tests | 132 |
| Passing | 127 |
| Failing | 4 (pre-existing Prisma client infra — no DB in CI) |
| Skipped | 1 |
| Duration | ~1.6s |

**Failing tests (all pre-existing, require live PostgreSQL):**
- `test/_dbtest.js` — Prisma client connection
- `test/attestation-route.test.js` — requires Prisma
- `test/envcrypto.test.js` — requires Prisma
- `test/integration.test.js` — requires Prisma

**Test runner:** `node --test` (Node.js built-in)

## 2. Lint

| Metric | Value |
|--------|-------|
| Errors | 0 |
| Warnings | 0 |
| Tool | ESLint |

## 3. API route inventory

### Admin routes (`/api/admin/*`)
| Method | Path |
|--------|------|
| GET | `/api/admin/users` |
| POST | `/api/admin/users` |
| DELETE | `/api/admin/users/:id` |
| PATCH | `/api/admin/users/:id/password` |
| GET | `/api/admin/ip-bans` |
| POST | `/api/admin/ip-bans` |
| DELETE | `/api/admin/ip-bans/:id` |
| GET | `/api/admin/settings` |
| PATCH | `/api/admin/settings` |

### Auth routes (`/api/auth/*`)
| Method | Path |
|--------|------|
| POST | `/api/auth/login` |
| GET | `/api/auth/me` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/sessions` |
| DELETE | `/api/auth/sessions/:id` |
| POST | `/api/auth/change-password` |
| POST | `/api/auth/revoke-sessions` |
| POST | `/api/auth/refresh` |
| POST | `/api/auth/2fa/setup` |
| POST | `/api/auth/2fa/enable` |
| POST | `/api/auth/2fa/disable` |
| POST | `/api/auth/tokens` |
| GET | `/api/auth/tokens` |
| DELETE | `/api/auth/tokens/:id` |

### Audit routes (`/api/audit/*`)
| Method | Path |
|--------|------|
| GET | `/api/audit/verify` |
| GET | `/api/audit` |

### Deploy routes (`/api/deploy/*`)
| Method | Path |
|--------|------|
| POST | `/api/deploy/plan` |
| POST | `/api/deploy/analyze` |
| POST | `/api/deploy` |
| POST | `/api/deploy/:slug/redeploy` |
| GET | `/api/deploy/:slug/build-log` |

### Project routes (`/api/projects/*`)
| Method | Path |
|--------|------|
| GET | `/api/projects` |
| GET | `/api/projects/:slug` |
| POST | `/api/projects/:slug/start` |
| POST | `/api/projects/:slug/stop` |
| POST | `/api/projects/:slug/restart` |
| DELETE | `/api/projects/:slug` |
| POST | `/api/projects/:slug/purge` |
| PATCH | `/api/projects/:slug/visibility` |
| POST | `/api/projects/:slug/publish-route` |
| PATCH | `/api/projects/:slug/limits` |
| POST | `/api/projects/:slug/health` |
| POST | `/api/projects/:slug/rollback` |
| POST | `/api/projects/:slug/provision-db` |
| PATCH | `/api/projects/:slug/repo` |
| PATCH | `/api/projects/:slug/primary` |
| GET | `/api/projects/:slug/deploy-history` |
| GET | `/api/projects/:slug/secrets` |
| PUT | `/api/projects/:slug/secrets` |
| POST | `/api/projects/:slug/secrets/:key/rotate` |
| DELETE | `/api/projects/:slug/secrets/:key` |
| GET | `/api/projects/:slug/env` |
| PUT | `/api/projects/:slug/env` |
| GET | `/api/projects/:slug/exec` |
| GET | `/api/projects/:slug/logs` |
| GET | `/api/projects/:slug/logs/download` |
| GET | `/api/projects/:slug/stats` |
| GET | `/api/projects/:slug/stats/history` |
| PUT | `/api/projects/:slug/runtime` |

### Server routes (`/api/server/*`)
| Method | Path |
|--------|------|
| GET | `/api/server/info` |
| GET | `/api/server/schema` |
| GET | `/api/server/features` |
| POST | `/api/server/backup` |
| GET | `/api/server/cleanup/preview` |
| POST | `/api/server/cleanup` |
| POST | `/api/server/cleanup/prune` |
| POST | `/api/server/notify-test` |

### Other routes
| Method | Path |
|--------|------|
| GET | `/api/runtimes` |
| GET | `/api/backups` |
| POST | `/api/backups/restore-drill` |
| GET | `/api/nodes` |
| POST | `/api/nodes` |
| PUT | `/api/nodes/:id` |
| DELETE | `/api/nodes/:id` |
| GET | `/api/nodes/:id/health` |
| POST | `/api/webhook/github/preview` |
| POST | `/api/webhook/github` |
| GET | `/api/previews` |
| DELETE | `/api/previews/:slug` |
| GET | `/api/internal/attestation/:slug` |
| POST | `/api/upload/init` |
| POST | `/api/upload/:id/chunk` |
| POST | `/api/upload/:id/complete` |
| DELETE | `/api/upload/:id` |

**Total routes: 80**

## 4. Prisma schema (current tables)

| Model | Table |
|-------|-------|
| User | `users` |
| Project | `projects` |
| AuditLog | `audit_log` |
| Session | `sessions` |
| IpBan | `ip_bans` |
| PlatformSetting | `platform_settings` |
| DeployHistory | `deploy_history` |
| StatsHistory | `stats_history` |
| Secret | `secrets` |
| ApiToken | `api_tokens` |
| Node | `nodes` |
| BackupRecord | `backup_records` |

**Total models: 12**

## 5. Caddy service inventory

| Export | Purpose |
|--------|---------|
| `systemsDir` | Path to per-system Caddy route files |
| `caddyfilePath` | Main Caddyfile path |
| `baseDomain` | Configured base domain |
| `appUpstreamHost` | Upstream target for app routing |
| `routeFile` | Path to a system's route file |
| `renderRoute` | Generate Caddy route config for a system |
| `writeRoute` | Write route file to disk |
| `removeRoute` | Delete a system's route file |
| `validate` | Validate Caddy config (`caddy validate`) |
| `reload` | Reload Caddy (`caddy reload`) |

Route files are per-system, written to `systemsDir/{slug}.caddy`.

## 6. Docker labels

All managed containers carry:
- `managed=acronym-deploy` — filter label for listing SYSTEMS.-managed containers
- `project={slug}` — links container to its project record

## 7. Backup system

| Setting | Default |
|---------|---------|
| Scheduler | Disabled (`ENABLE_BACKUP_SCHEDULER`) |
| Interval | 24 hours (configurable via `backupIntervalHours`) |
| Retention | 7 snapshots (configurable via `backupRetention`) |
| Destination | `{DATA_DIR}/backups/` |
| Restore script | `scripts/restore-systems-windows.ps1` |
| On-demand | `POST /api/server/backup` (always available) |

Backup includes: SQLite/Prisma database snapshot + Caddy route files.
Restore is manual and deliberate (no auto-restore).

## 8. Feature flags (defaults)

All V2/V3 features are gated behind environment variables and **off by default**.

| Flag | Default | Env var |
|------|---------|---------|
| `dockerfileMode` | false | `ENABLE_DOCKERFILE_MODE` |
| `shellConsole` | false | `ENABLE_SHELL_CONSOLE` |
| `githubDeploys` | false | `ENABLE_GITHUB_DEPLOYS` |
| `notifications` | false | `ENABLE_NOTIFICATIONS` |
| `dbProvisioning` | false | `ENABLE_DB_PROVISIONING` |
| `largeUploads` | false | `ENABLE_LARGE_UPLOADS` |
| `backupScheduler` | false | `ENABLE_BACKUP_SCHEDULER` |
| `dbMode` | `"shared"` | `DB_MODE` |
| `uploadMaxMb` | 100 | `UPLOAD_MAX_MB` |
| `v2UploadMaxMb` | 2048 | — |
| `previewEnvironments` | false | `ENABLE_PREVIEW_ENVIRONMENTS` |
| `multiNode` | false | `ENABLE_MULTI_NODE` |
| `objectStorageBackups` | false | `ENABLE_OBJECT_STORAGE_BACKUPS` |
| `apiTokens` | false | `ENABLE_API_TOKENS` |
| `secretsManagement` | false | `ENABLE_SECRETS_MANAGEMENT` |
| `buildCache` | false | `ENABLE_BUILD_CACHE` |

## 9. Platform constants

| Constant | Value |
|----------|-------|
| `PLATFORM_VERSION` | `2.0.0-rc.1` |
| `PLATFORM_STAGE` | `repo-complete · host validation pending` |
| Database | PostgreSQL (via Prisma) |
| Target host | Windows (Docker Desktop / WSL2) |
| Password minimum | 15 characters |
| Max admins | 2 |
| Session tracking | Per-device with IP + user-agent |
| 2FA | TOTP (optional) |
| Audit chain | Integrity-verified (hash chain) |

---

## 10. Dashboard views

| View | File | Notes |
|------|------|-------|
| Login | `dashboard/src/views/Login.vue` | Auth gate |
| Systems | `dashboard/src/views/Systems.vue` | Main grid, bulk ops, pagination |
| SystemDetail | `dashboard/src/views/SystemDetail.vue` | Per-system tabs |
| Ship | `dashboard/src/views/Ship.vue` | Deploy wizard |
| Server | `dashboard/src/views/Server.vue` | Infrastructure, backups, cleanup |
| Events | `dashboard/src/views/Events.vue` | Audit log with filters + pagination |
| Admin | `dashboard/src/views/Admin.vue` | Users, sessions, 2FA, settings |

---

*This report is a Phase 0.5 exit gate artifact. It should not be modified after commit — future snapshots should be new files.*
