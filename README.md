<p align="center">
  <img src="docs/assets/header.svg" alt="SYSTEMS. by Acronym" width="100%" />
</p>

# SYSTEMS.
### by Acronym

SYSTEMS. is a self-hosted tool for deploying your own apps. You drop in a zip,
it builds the app, runs it in a Docker container, and serves it at a subdomain.

It runs on your own server and it's just for you — only admins can log in, and
there's no public sign-up. It's not a service you'd hand to other people.

## What it does

- Takes a zip (Vue/Vite or a static site), builds it, and runs it in a container.
- Gives each app a URL and lets you make it public, password-protected, or private.
- Shows status, logs, and metrics, and keeps an audit log of everything you do.
- Lets you start, stop, restart, redeploy, roll back, and delete apps.

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
| Reverse proxy | Caddy (it generates the route files; the local dev setup still uses nginx) |
| Internal DB | SQLite for now; Postgres is supported, you just point it at one |
| Auth | JWT bearer token, bcrypt password hashes |

The Caddy and Postgres code is all here — you just connect it on the real
server. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the
[Windows checklist](docs/WINDOWS_VALIDATION_CHECKLIST.md).

## Admin model

- No public signup.
- Two admins maximum. The first comes from `.env` (`ADMIN_USERS`); the second is
  added on the Admin screen.
- All dashboard, API, and deployment actions require admin auth.

## Deployment support

- **Working now:** Vue/Vite source zips and static sites (it figures out the
  build type for you).
- **Written, but needs a real server to confirm:** Node APIs and background
  workers, custom Dockerfiles (off by default), Postgres databases per app,
  big (2 GB) uploads, and GitHub deploys. See [`docs/V2_ROADMAP.md`](docs/V2_ROADMAP.md).
- The riskier stuff is off until you turn it on in `.env`.

## Dashboard

- **Systems** — overview: counts, what needs attention, latest deploy, system cards.
- **Ship** — build & deploy a zip (desktop workbench; stepped on mobile).
- **Events** — time-stamped audit log of admin and deploy actions.
- **Server** — what Docker / Caddy / Postgres / DNS are actually doing, plus how
  SYSTEMS. itself is holding up.
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

> Anything that needs a real running server — Docker, Caddy, Postgres, HTTPS,
> DNS — is labelled "requires host validation" in the dashboard and docs until
> you've confirmed it on the actual machine. The
> [Windows checklist](docs/WINDOWS_VALIDATION_CHECKLIST.md) walks through that.

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
