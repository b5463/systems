<p align="center">
  <img src="docs/assets/systems-wordmark-white.png#gh-dark-mode-only" alt="SYSTEMS." width="420" />
  <img src="docs/assets/systems-wordmark.png#gh-light-mode-only" alt="SYSTEMS." width="420" />
</p>
<p align="center">
  <img src="docs/assets/header.svg" alt="SYSTEMS. by Acronym" width="100%" />
</p>

# SYSTEMS.
### by Acronym

A private, self-hosted deployment platform for one operator. Upload a zip and it
builds, containerizes, and serves the result at a subdomain. Admin-only; no
public signup.

It is single-tenant and runs on one server — not a multi-tenant SaaS or PaaS.

## What it does

- Builds and runs containerized systems from an uploaded zip (Vue/Vite, static).
- Manages reverse-proxy routes, with public / password / private visibility.
- Shows status, logs, metrics, and an audited event stream.
- Provides start/stop/restart/redeploy, rollback, and delete/purge.

## Domain model

| Domain | Purpose |
| --- | --- |
| `acronym.sk` | Public portfolio (separate from SYSTEMS.) |
| `systems.acronym.sk` | The SYSTEMS. dashboard |
| `{slug}.acronym.sk` | A deployed system (e.g. `notes.acronym.sk`) |

DNS is configured **manually in Websupport** with a wildcard; SYSTEMS. does not
automate DNS. Assume these records exist:

```
A   acronym.sk     → SERVER_IP
A   *.acronym.sk   → SERVER_IP
```

DNS points the domains at the server; SYSTEMS. handles routing from there.

## Stack

| Part | Details |
| --- | --- |
| Frontend | Vue 3 + Vite (PWA) |
| API | Node.js + Fastify |
| Containers | Docker (isolated bridge network, per-container resource limits) |
| Reverse proxy | Caddy route generation implemented; the current dev compose uses nginx |
| Internal DB | SQLite today; Postgres support implemented (connection is a host step) |
| Auth | JWT bearer token, bcrypt hashes |

Caddy routing and Postgres are implemented in the repo but connecting them is a
Windows-host step; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/WINDOWS_VALIDATION_CHECKLIST.md`](docs/WINDOWS_VALIDATION_CHECKLIST.md).

## Admin model

- No public signup.
- Two admins maximum. The first comes from `.env` (`ADMIN_USERS`); the second is
  added on the Admin screen.
- All dashboard, API, and deployment actions require admin auth.

## Deployment support

- **Now:** Vue/Vite source zips and static sites (build type auto-detected).
- **Implemented, host-validated:** Node API and worker projects, custom
  Dockerfile (off by default), Postgres provisioning helpers, chunked-upload
  validation, GitHub webhook verification. See [`docs/V2_ROADMAP.md`](docs/V2_ROADMAP.md).
- Risky features are off by default and enabled via `.env`.

## Dashboard

- **Systems** — overview: counts, what needs attention, latest deploy, system cards.
- **Ship** — build & deploy a zip (desktop workbench; stepped on mobile).
- **Events** — time-stamped audit log of admin and deploy actions.
- **Server** — observed status of Docker / Caddy / Postgres / wildcard DNS, plus
  SYSTEMS.' own health.
- **Admin** — profile, password, second admin, limits & retention.
- **System detail** — overview, deployments, logs, metrics, console, settings.

## Run locally

```bash
# API (full functionality needs a Docker socket)
cp .env.example .env            # set JWT_SECRET, ENV_SECRET, ADMIN_USERS
cd api && npm install && npm run dev      # http://localhost:3000

# Dashboard
cd dashboard && npm install && npm run dev   # proxies /api to :3000
```

Run the tests:

```bash
cd api && npm test               # pure-logic unit tests
```

## Production (Windows)

The target is a Windows host with Docker Desktop (WSL2, Linux containers). The
step-by-step guide is [`docs/WINDOWS_DEPLOYMENT.md`](docs/WINDOWS_DEPLOYMENT.md),
with PowerShell scripts in [`scripts/`](scripts) (`setup`, `deploy`, `backup`,
`restore`, `update`, `check-systems-health`, `check-firewall`,
`verify-hardening`). Data lives under `C:\ProgramData\SYSTEMS`. Linux is a
development path.

> This environment can't validate Docker/Caddy/Postgres/HTTPS/DNS, so anything
> requiring a live host is marked "requires host validation" in the UI and docs.
> See [`docs/WINDOWS_VALIDATION_CHECKLIST.md`](docs/WINDOWS_VALIDATION_CHECKLIST.md).

## Security

SYSTEMS. controls Docker, the reverse proxy, uploaded code, env vars, routes,
and logs, so it is privileged. Keep it admin-only and private; never expose the
Docker socket, the proxy admin API, or the database to the internet; treat
uploaded code as untrusted. It is built to be hardened and least-privilege — not
"unhackable." See [`docs/SECURITY.md`](docs/SECURITY.md).

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture & data model
- [`docs/WINDOWS_DEPLOYMENT.md`](docs/WINDOWS_DEPLOYMENT.md) — Windows production guide
- [`docs/SERVER_DEPLOYMENT_GUIDE.md`](docs/SERVER_DEPLOYMENT_GUIDE.md) — deployment surface + Linux dev
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — how a zip becomes a live system
- [`docs/SECURITY.md`](docs/SECURITY.md) — security model & firewall
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — day-2 operations
- [`docs/BACKUPS.md`](docs/BACKUPS.md) — backup & restore
- [`docs/RESOURCE_LIMITS.md`](docs/RESOURCE_LIMITS.md) — per-container limits
- [`docs/HARDENING.md`](docs/HARDENING.md) — hardening verification
- [`docs/UPDATE_STRATEGY.md`](docs/UPDATE_STRATEGY.md) — updating SYSTEMS.
- [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md) — recovery runbook
- [`docs/WINDOWS_VALIDATION_CHECKLIST.md`](docs/WINDOWS_VALIDATION_CHECKLIST.md) — host validation steps
- [`docs/V2_ROADMAP.md`](docs/V2_ROADMAP.md) — roadmap
- V2 features: [`DATABASES`](docs/DATABASES.md) · [`LARGE_UPLOADS`](docs/LARGE_UPLOADS.md) · [`DOCKERFILE_MODE`](docs/DOCKERFILE_MODE.md) · [`WORKERS`](docs/WORKERS.md) · [`GITHUB_DEPLOYS`](docs/GITHUB_DEPLOYS.md) · [`NOTIFICATIONS`](docs/NOTIFICATIONS.md) · [`SHELL_CONSOLE`](docs/SHELL_CONSOLE.md)
