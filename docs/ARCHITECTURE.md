<p align="center"><img src="assets/header.svg" alt="SYSTEMS. by Acronym" width="100%" /></p>

# SYSTEMS. — Architecture

> Status: **V1.1 foundation.** This documents what exists today and the locked
> targets for V1.2. Where today ≠ target, both are stated plainly.

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
- **API** — Node.js + Fastify. The *only* component that touches the Docker
  socket. Owns deploy pipeline, lifecycle, routing files, logs, metrics, audit.
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
| admins (`users`) | id, username, password_hash | email, role, last_login |
| systems (`projects`) | name, slug, container_id, image_id, port, status, env_vars (encrypted), prev image/container | `visibility` (public/password/private), `deploy_type`, `route_id`, health fields |
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

## 5. Why SQLite + nginx are still here in V1.1

The locked decisions target **Postgres** and **Caddy**. V1.1 is a *product
shell + foundation* pass with an explicit instruction not to rush dangerous
backend/server changes. The existing SQLite + nginx backend is fully working and
load-bearing. Swapping the live database and reverse proxy at the same time as
restructuring the entire UI would:

- risk data loss / downtime with no incremental safety net,
- couple two large migrations into one un-reviewable change,
- precede the V1.2 deploy-engine work that actually consumes the new schema
  (visibility, routes table) and Caddy route files.

**Decision:** keep SQLite + nginx running and *honest* in V1.1; perform the
Postgres and Caddy migrations as dedicated, reviewable V1.2 steps with a
data-migration script and a route-file generator. The Server screen reports the
real components in use (nginx, sqlite) — it never claims Caddy/Postgres are live.

## 6. V1.2 migration plan (high level)

1. **Postgres:** introduce a DB abstraction, add Postgres schema + migrations,
   write a SQLite→Postgres data migration, cut over behind `POSTGRES_*` env.
2. **Caddy:** add a `Caddyfile` + `systems.d/` generator, port the route
   service from nginx-config writing to Caddy route files, switch the
   compose service, keep nginx removable in one step.
3. **Schema:** add `visibility`, `deploy_type`, explicit `routes` table.
4. **Auth:** migrate from localStorage JWT to HTTP-only cookie sessions + CSRF
   (see [`SECURITY.md`](SECURITY.md)).
