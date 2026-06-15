<p align="center"><img src="assets/header.svg" alt="SYSTEMS. — deployment engine" width="100%" /></p>

# SYSTEMS. — Architecture

> How SYSTEMS. is put together — what's running today and what it's heading
> toward, side by side.

## 1. Components

```
                        Internet (Websupport wildcard DNS → SERVER_IP)
                                          │
                                  ┌───────▼────────┐
                                  │  Reverse proxy │   nginx today / Caddy (V1.2)
                                  │  systems.* + slug.* routing, TLS
                                  └───┬───────┬────┘
                  systems.acronym.sk  │       │  {slug}.acronym.sk
                            ┌─────────▼─┐   ┌─▼───────────────┐
                            │ Dashboard │   │ Deployed systems │ (one container each,
                            │ (static)  │   │  isolated bridge │  isolated network)
                            └─────┬─────┘   └─────────▲────────┘
                              /api │                  │ Docker API (internal only)
                            ┌─────▼──────────────────┴───┐
                            │   SYSTEMS. API (Fastify)    │
                            │   auth · deploy · routing   │
                            │   logs · metrics · audit    │
                            └──────────┬──────────────────┘
                                       │
                            ┌──────────▼──────────┐
                            │ Internal DB          │  SQLite today / Postgres (V1.2)
                            └─────────────────────┘
```

- **Dashboard** — Vue 3 + Vite PWA, served as static files. Talks only to `/api`.
- **API** — Node.js + Fastify (built via `buildApp()` in `src/app.js`, so it can
  be exercised with `app.inject()` in tests). The *only* component that touches
  the Docker socket. Owns deploy pipeline, lifecycle, routing files, logs,
  metrics, audit, auth (JWT + `token_version` + optional TOTP), and the gated V2
  routes (`/api/upload/*`, `/api/webhook/github`, `/api/projects/:slug/provision-db`).
- **Reverse proxy** — terminates TLS, routes `systems.*` to the dashboard and
  `{slug}.*`/path routes to each system's container.
- **Deployed systems** — one container per system on an isolated bridge network
  (`enable_icc=false`), with dropped capabilities and `no-new-privileges`.
- **Internal DB** — platform state (admins, systems, deployments, events, env
  metadata, route records, metrics snapshots).

## 2. Internal data model

V1.1 (SQLite) tables: `users`, `projects`, `audit_log`, `deploy_history`,
`stats_history`. The V1.2 Postgres schema keeps these and adds first-class
columns the product spec calls for:

| Entity | V1.1 today | V1.2 additions |
| --- | --- | --- |
| admins (`users`) | id, username, password_hash, `token_version` (session revocation), `totp_secret`/`totp_enabled` (opt-in 2FA) | email, role, last_login |
| systems (`projects`) | name, slug, container_id, image_id, port, status, env_vars (encrypted), prev image/container, `visibility`, `deploy_type`, health fields, `route_published`, `repo`/`deploy_branch` (GitHub deploys) | explicit `route_id` |
| deployments (`deploy_history`) | image_id, container_id, deployed_at | release number, size, build duration, status |
| events (`audit_log`) | user_id, action, target, detail, ip, created_at | (unchanged) |
| metrics (`stats_history`) | cpu, mem, net snapshots | retention policy |
| routes | implicit (proxy config files) | explicit `routes` table mirroring proxy state |
| settings | from `.env` | persisted, editable in Admin |

## 3. Routing model

- **Today (nginx):** a main `nginx.conf` `include`s per-system files in
  `nginx/conf.d/*.conf`; the API writes one file per system and reloads nginx.
- **Target (Caddy, V1.2):** a main `Caddyfile` that `import`s generated
  per-system route files from a `systems.d/` directory; the API writes one
  route file per system and reloads Caddy via its admin API (bound to
  localhost only). HTTPS becomes automatic per-host.

Visibility drives routing:

| Visibility | Route in V1 |
| --- | --- |
| Public | Public route published |
| Password protected | Public route + basic auth (V1.2, if safe) |
| Private / internal | **No public route** |

## 4. Deploy pipeline (today)

`upload → zip-slip-safe extract → detect type → generate Dockerfile (if needed)
→ build image → run hardened container on free port → write route → reload proxy
→ live`. Redeploys snapshot the previous image for rollback. See
[`DEPLOYMENT.md`](DEPLOYMENT.md).

## 5. Background services & operations

Beyond request handling, the API runs a few in-process jobs (started in
`src/index.js`, configurable via `.env`):

- **Reconciliation** (`services/reconcile.js`) — on boot and every
  `RECONCILE_INTERVAL_SEC` (default 30), it compares each system's stored status
  against the real Docker container state and corrects drift, so crashes and
  reboots don't leave stale "running" rows. Pure decision logic is unit-tested.
- **Backups** (`services/backup.js`) — an online SQLite snapshot (WAL-safe) plus
  the Caddy routes dir, written to `BACKUP_DIR` with a manifest and retention
  pruning. Always available on demand (`POST /api/server/backup`, the Server
  screen's "Back up now"); the periodic scheduler is gated behind
  `ENABLE_BACKUP_SCHEDULER`. Complements the host-level PowerShell backups.
- **Notifications** (`services/notify.js`) — best-effort outbound webhook on
  deploy success/failure, redeploy, and reconcile-to-error. Off unless
  `ENABLE_NOTIFICATIONS` + `NOTIFY_WEBHOOK_URL` are set.

GitHub deploy-on-push (`routes/webhook.js`) and per-app Postgres provisioning
(`services/dbprovision-runner.js`, optional `pg`) are wired but stay behind their
flags — both pull or run external code, so they're host-validated. See
[`OPERATIONS.md`](OPERATIONS.md), [`GITHUB_DEPLOYS.md`](GITHUB_DEPLOYS.md),
[`DATABASES.md`](DATABASES.md), and [`NOTIFICATIONS.md`](NOTIFICATIONS.md).

## 6. Why SQLite + nginx are still here in V1.1

The locked decisions target **Postgres** and **Caddy**. V1.1 is a *product
shell + foundation* pass with an explicit instruction not to rush dangerous
backend/server changes. The existing SQLite + nginx backend is fully working and
load-bearing. Swapping the live database and reverse proxy at the same time as
restructuring the entire UI would:

- risk data loss / downtime with no incremental safety net,
- couple two large migrations into one un-reviewable change,
- precede the V1.2 deploy-engine work that actually consumes the new schema
  (visibility, routes table) and Caddy route files.

**Decision:** keep SQLite + nginx running in V1.1; do the
Postgres and Caddy migrations as dedicated, reviewable V1.2 steps with a
data-migration script and a route-file generator. The Server screen reports the
real components in use (nginx, sqlite) — it never claims Caddy/Postgres are live.

## 7. V1.2 migration plan (high level)

1. **Postgres:** introduce a DB abstraction, add Postgres schema + migrations,
   write a SQLite→Postgres data migration, cut over behind `POSTGRES_*` env.
2. **Caddy:** add a `Caddyfile` + `systems.d/` generator, port the route
   service from nginx-config writing to Caddy route files, switch the
   compose service, keep nginx removable in one step.
3. **Schema:** add `visibility`, `deploy_type`, explicit `routes` table.
4. **Auth:** migrate from localStorage JWT to HTTP-only cookie sessions + CSRF
   (see [`SECURITY.md`](SECURITY.md)).
