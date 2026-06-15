<p align="center"><img src="assets/header.svg" alt="SYSTEMS. — deployment engine" width="100%" /></p>

# SYSTEMS. — Architecture

The dashboard, the API, the proxy, the database, and the containers each deployed
system runs in. Here's how they fit together.

## 1. Components

```
                        Internet (Websupport wildcard DNS → SERVER_IP)
                                          │
                                  ┌───────▼────────┐
                                  │  Reverse proxy │   Caddy (prod) / nginx (dev)
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
                            │ Internal DB          │  Postgres (prod) / SQLite (dev)
                            └─────────────────────┘
```

- **Dashboard** — Vue 3 + Vite PWA, served as static files. Talks only to `/api`.
- **API** — Node.js + Fastify, built via `buildApp()` in `src/app.js` so you can
  exercise it with `app.inject()` in tests. It's the only component that touches
  the Docker socket. It owns the deploy pipeline, lifecycle, routing files, logs,
  metrics, audit, auth (JWT + `token_version` + optional TOTP), and the opt-in
  routes (`/api/upload/*`, `/api/webhook/github`, `/api/projects/:slug/provision-db`).
- **Reverse proxy** — terminates TLS, routes `systems.*` to the dashboard and
  `{slug}.*`/path routes to each system's container.
- **Deployed systems** — one container per system on an isolated bridge network
  (`enable_icc=false`), with dropped capabilities and `no-new-privileges`.
- **Internal DB** — platform state (admins, systems, deployments, events, env
  metadata, route records, metrics snapshots).

## 2. Internal data model

The tables are `users`, `projects`, `audit_log`, `deploy_history`, and
`stats_history`. The "not yet" column lists columns the spec calls for that
aren't in the schema yet.

| Entity | Columns | Not yet |
| --- | --- | --- |
| admins (`users`) | id, username, password_hash, `token_version` (session revocation), `totp_secret`/`totp_enabled` (opt-in 2FA) | email, role, last_login |
| systems (`projects`) | name, slug, container_id, image_id, port, status, env_vars (encrypted), prev image/container, `visibility`, `deploy_type`, health fields, `route_published`, `repo`/`deploy_branch` (GitHub deploys) | explicit `route_id` |
| deployments (`deploy_history`) | image_id, container_id, deployed_at | release number, size, build duration, status |
| events (`audit_log`) | user_id, action, target, detail, ip, created_at | — |
| metrics (`stats_history`) | cpu, mem, net snapshots | retention policy |
| routes | implicit (proxy config files) | explicit `routes` table mirroring proxy state |
| settings | from `.env` | persisted, editable in Admin |

## 3. Routing model

Both proxies are wired up. You pick one with `REVERSE_PROXY`.

- **nginx (dev default):** a main `nginx.conf` `include`s per-system files in
  `nginx/conf.d/*.conf`; the API writes one file per system and reloads nginx.
- **Caddy (production):** a main `Caddyfile` that `import`s generated per-system
  route files from a `systems.d/` directory; the API writes one route file per
  system and reloads Caddy via its admin API (bound to localhost only). HTTPS is
  automatic per-host. This path is pending host validation.

Visibility drives routing:

| Visibility | Route |
| --- | --- |
| Public | Public route published |
| Password protected | Public route + basic auth |
| Private / internal | **No public route** |

One system can also be flagged **primary**: its Caddy route then matches both
`{slug}.{base}` and the bare apex `{base}` (e.g. `acronym.sk`) in the same site
block, so the root domain serves it (typically a portfolio). The dashboard
always stays on `systems.{base}`. Only one system is primary at a time, and a
private system can't be (no public route to serve). Endpoint:
`PATCH /api/projects/:slug/primary`.

## 4. Deploy pipeline

`upload → zip-slip-safe extract → detect type → generate Dockerfile (if needed)
→ build image → run hardened container on free port → write route → reload proxy
→ live`. Redeploys snapshot the previous image for rollback. See
[`DEPLOYMENT.md`](DEPLOYMENT.md).

## 5. Background services & operations

Beyond request handling, the API runs a few in-process jobs, started in
`src/index.js` and configurable via `.env`:

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
(`services/dbprovision-runner.js`, optional `pg`) are built and stay off behind
their flags, since both pull or run external code. See
[`OPERATIONS.md`](OPERATIONS.md), [`GITHUB_DEPLOYS.md`](GITHUB_DEPLOYS.md),
[`DATABASES.md`](DATABASES.md), and [`NOTIFICATIONS.md`](NOTIFICATIONS.md).

## 6. SQLite + nginx vs Postgres + Caddy

SQLite and nginx are the current dev defaults; Postgres and Caddy are the
production targets, both wired and pending host validation. Each was built as its
own reviewable cutover rather than swapped in alongside everything else. The
Server screen reports whichever components are actually in use, and never claims
Caddy or Postgres are live when they aren't.

Still not done: migrating auth from a localStorage JWT to HTTP-only cookie
sessions + CSRF (see [`SECURITY.md`](SECURITY.md)).
