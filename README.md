<p align="center">
  <img src="docs/assets/header.svg" alt="SYSTEMS. — deployment engine" width="100%" />
</p>

# SYSTEMS.

<p align="center"><em>Your own deployment engine — zip in, live URL out.</em></p>

<p align="center">
  <a href="https://github.com/b5463/systems/actions/workflows/ci.yml"><img src="https://github.com/b5463/systems/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/version-2.0.0--rc.1-5fb0d4" alt="version" />
  <img src="https://img.shields.io/badge/Vue%203%20%C2%B7%20Fastify-1a1c22" alt="stack" />
  <img src="https://img.shields.io/badge/PWA-installable-45c267" alt="PWA" />
  <img src="https://img.shields.io/badge/license-MIT-585c66" alt="MIT" />
</p>

Drop in a zip and SYSTEMS. works out how to build it, runs it in a hardened
Docker container, and serves it at its own subdomain with automatic HTTPS. It's
the push-button deploy flow you'd get from Vercel or Render, running on a server
you own — no cloud account, no per-seat billing, no shipping your source to
someone else's platform.

Every app you deploy is a **system**: its own subdomain, its own status, logs,
metrics, and one-click rollback, all from a single dashboard.

<p align="center">
  <img src="docs/assets/screenshots/deploy.gif" alt="Ship a zip and watch it go live" width="100%" />
  <br /><em>Drop an archive, watch it build, and it's live over HTTPS.</em>
</p>

**Where it's at:** 2.0 release candidate. The code is all here and tested; what's
left is proving the live pieces — Docker, Caddy, optional Postgres, HTTPS — on
the real Windows host.

## What you get

- **Build from a zip.** Drop a Vue/Vite or static-site archive and it figures out
  the build, containers it, and puts it on its own subdomain with HTTPS.
- **Per-system control.** Public, password-protected, or private; start, stop,
  restart, redeploy, roll back, or delete — each a single click.
- **Status you can trust.** It checks each system against what Docker is actually
  doing, so a crash or reboot never leaves a stale "running" badge — and it tells
  a failed build apart from a crashed container.
- **See everything.** Live logs, an interactive container shell, metrics, and a
  tamper-evident audit trail of every action.
- **Safe by default.** Optional two-factor, encrypted env vars, typed-confirmation
  on destructive actions, a hash-chained audit log, and built-in backups.

## A look around

<p align="center">
  <img src="docs/assets/screenshots/dashboard.png" alt="SYSTEMS. dashboard" width="100%" />
  <br /><em>Every system's live status, what needs attention, and one-click control.</em>
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshots/ship.png" alt="Ship a zip" /><br /><em><b>Ship.</b> Drop a zip; see the container name and route before you commit.</em></td>
    <td width="50%"><img src="docs/assets/screenshots/system.png" alt="System detail" /><br /><em><b>Control.</b> A clear status grid and one-click actions per system.</em></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/assets/screenshots/server.png" alt="Server health" /><br /><em><b>Watch.</b> Docker, proxy, database, disk, backups — and SYSTEMS. itself.</em></td>
    <td width="50%" align="center"><img src="docs/assets/screenshots/mobile.png" alt="Mobile PWA" width="50%" /><br /><em><b>Anywhere.</b> Installable PWA — run your fleet from your phone.</em></td>
  </tr>
</table>

## Who it's for

- **Indie devs & makers** running a portfolio, a few side projects, and the odd
  client demo on a single VPS — without paying per-project or per-seat.
- **Small teams** that want push-button deploys on infrastructure they control,
  with the source never leaving their box.
- **Homelab & self-hosting** folks who'd rather own the whole stack than rent it.

### Where it fits

Vercel and Render are great, but they're someone else's cloud — metered and
multi-tenant. The bigger self-hosted PaaS tools (Coolify, Dokku, CapRover) are
powerful and general-purpose. SYSTEMS. is deliberately small and opinionated:
single-host, Windows-first, no public signup, and careful about status — it
won't show a green light it hasn't actually checked. If you want one focused
deploy engine you can read end to end, that's the gap it fills.

## Domain model

| Domain | Purpose |
| --- | --- |
| `acronym.sk` | The **primary** system — whichever one you flag to serve the bare root domain (e.g. your portfolio) |
| `systems.acronym.sk` | The SYSTEMS. dashboard |
| `{slug}.acronym.sk` | Each deployed system at its own subdomain (e.g. `notes.acronym.sk`) |

Every system always gets its `{slug}.acronym.sk` subdomain. You can additionally
mark **one** system as primary (System detail → Settings → Root domain) so it's
also served at the bare `acronym.sk`. The dashboard stays on
`systems.acronym.sk`. A private system can't be primary — it has no public route.

DNS is set up **manually in Websupport** with a wildcard; SYSTEMS. doesn't
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
| Reverse proxy | Caddy (it generates the route files; local dev still uses nginx) |
| Internal DB | SQLite; optional Postgres provisions databases for deployed apps |
| Auth | JWT bearer token, bcrypt password hashes, optional TOTP two-factor, sign-out-everywhere |

The Caddy integration and optional per-system Postgres provisioning are wired;
the SYSTEMS. control-plane store itself remains SQLite. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the
[Windows checklist](docs/WINDOWS_VALIDATION_CHECKLIST.md).

## Admin model

SYSTEMS. is your control panel, not a service, so access is locked down:

- No public signup.
- Two admins maximum. The first comes from `.env` (`ADMIN_USERS`); the second is
  added on the Admin screen.
- Every dashboard, API, and deployment action requires an authenticated admin.
- Optional two-factor (TOTP) per admin, plus a "sign out other sessions" control
  that revokes every other token (a password change or reset does the same).

## Deployment support

- **Working now:** Vue/Vite source zips and static sites — it works out the build
  type for you.
- **Wired up but off by default:** custom Dockerfiles, an interactive container
  shell, per-app Postgres provisioning, large (2 GB) chunked uploads, GitHub
  deploy-on-push, and outbound notifications. The endpoints and UI all exist; each
  one stays behind its `.env` flag because the riskier ones pull or run external
  code, so you turn them on deliberately.
- **Still needs a real server to confirm:** Node API/worker runtimes, Caddy
  routing, optional per-app Postgres provisioning, and HTTPS — the parts only a
  live host can prove out. See
  [`docs/V2_ROADMAP.md`](docs/V2_ROADMAP.md).

## Preparing a project to deploy

You ship a **zip of your project**. SYSTEMS. inspects what's inside, picks a
build, containers it, and serves it. You don't write any SYSTEMS.-specific
config — just package your app so it fits one of the shapes below.

**The one golden rule:** your app must serve HTTP on **port 3000** inside the
container. Static sites get this for free; for Node/Python you bind to `3000`
yourself. The dashboard maps a public port to `3000` automatically.

How the build type is auto-detected from the archive (a single top-level folder
is fine — it's unwrapped for you):

| Your project has… | Detected as | What runs |
| --- | --- | --- |
| just HTML/CSS/JS (no `package.json`) | **static** | nginx serves it on `:3000`, with SPA fallback to `index.html` |
| a `package.json` | **node** | `node:20-alpine`, `npm install --production`, then `npm start` |
| `requirements.txt` or `pyproject.toml` | **python** | `python:3.12-slim`, `pip install -r requirements.txt`, then runs `app.py` (or `main.py`) |
| a `Dockerfile` at the root | **dockerfile** | built as-is — **gated**, needs `ENABLE_DOCKERFILE_MODE` |

### Per-type checklist

- **Static site** (incl. a pre-built Vue/Vite/React app): zip the **built
  output** so `index.html` is at the root (e.g. the contents of `dist/`, not the
  source). Client-side routes fall back to `index.html` automatically. Nothing
  to configure.
- **Node**: include a `package.json` with a `"start"` script that launches a
  server **listening on `0.0.0.0:3000`**. Runtime dependencies must be under
  `"dependencies"` (dev-only deps are skipped by `npm install --production`). A
  raw Vue/Vite *source* zip is detected as Node — if you just want the static
  build, ship the built output instead (above).
- **Python**: include `requirements.txt` (or `pyproject.toml`) and an entrypoint
  named `app.py` or `main.py` that listens on `0.0.0.0:3000`.
- **Dockerfile** (advanced): `EXPOSE 3000` and serve there. Only built when
  `ENABLE_DOCKERFILE_MODE` is on, since it runs your build instructions.

### Good to know

- **Size:** archives up to **100 MB** by default (≤ 5000 entries, ≤ 100 MB per
  file). Larger uploads need `ENABLE_LARGE_UPLOADS` (up to 2 GB).
- **Secrets / env vars:** don't bake them into the image. Deploy first, then add
  them per system under **System detail → Settings** — they're stored encrypted
  and injected into the container (saving them recreates it).
- **Health:** SYSTEMS. probes `/` shortly after deploy/redeploy and stores the
  observed state, HTTP status, response time, and check time. Published systems
  are checked through their real public URL (including DNS, TLS, and the proxy);
  private and unpublished systems fall back to `127.0.0.1:<host-port>`;
  `LOCAL_MODE=true` forces that target even when a route is marked published.
  A 2xx or 3xx response is healthy. Published routes also reserve
  `/.well-known/systems/v1/attestation`: the proxy—not uploaded code—answers a
  fresh challenge with a five-second AES-256-GCM encrypted attestation. This
  proves the managed route and detects tampering/replay; it does not replace the
  separate application probe. Per-system health paths are not configurable yet.
- **After it's live:** it's served at `{slug}.<base>`; choose Public,
  password-protected, or Private (no public route) in Settings.

Full pipeline details and routing are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Dashboard

- **Systems** — overview: counts, what needs attention, latest deploy, system cards.
- **Ship** — build & deploy a zip (desktop workbench; stepped on mobile).
- **Events** — time-stamped log of admin and deploy actions.
- **Server** — what Docker / Caddy / Postgres / DNS are actually doing, plus how
  SYSTEMS. itself is holding up; "back up now" and a notification test.
- **Admin** — profile, password, two-factor, sessions, second admin, limits.
- **System detail** — overview, deployments, logs, metrics, console, settings
  (env vars, visibility, root-domain toggle, and — when enabled — repo mapping
  and DB provisioning).

## Run locally

```bash
# API (full functionality needs a Docker socket)
cp .env.example .env            # set JWT_SECRET, ENV_SECRET, ADMIN_USERS
cd api && npm install && npm run dev:local # http://localhost:3000; reads ../.env

# Dashboard
cd dashboard && npm install && npm run dev   # proxies /api to :3000
```

Run the tests:

```bash
cd api && npm test               # unit + route/integration tests (Docker E2E skipped)
cd api && npm run test:e2e       # real zip → container → HTTP → redeploy → rollback; requires Docker
```

## Configuration

Everything is set in `.env` (copy from [`.env.example`](.env.example)). The keys
you actually need to run:

| Key | What it's for |
| --- | --- |
| `JWT_SECRET` | Signs admin session tokens. Long random string. |
| `ENV_SECRET` | AES-256-GCM key encrypting per-system env vars at rest. |
| `ADMIN_USERS` | First admin(s), `user:password` (two max, no public signup). |
| `BASE_DOMAIN` | Root domain (e.g. `acronym.sk`). |
| `CORS_ORIGIN` | Locked to the dashboard origin. |
| `REVERSE_PROXY` | `caddy` (production) or `nginx` (dev default). |
| `RECONCILE_INTERVAL_SEC` | How often status is reconciled against Docker (0 disables). |
| `PUBLIC_SCHEME` | Scheme used for public health probes (`https` by default). |
| `LOCAL_MODE` | Probe system host ports directly; use with the local Vite/API setup. |

Riskier capabilities are **off by default** and opt-in per flag:

| Flag | Enables |
| --- | --- |
| `ENABLE_LARGE_UPLOADS` | Chunked uploads up to `V2_UPLOAD_MAX_MB`. |
| `ENABLE_DOCKERFILE_MODE` | Building archives that ship their own Dockerfile. |
| `ENABLE_SHELL_CONSOLE` | Interactive in-container shell. |
| `ENABLE_DB_PROVISIONING` | Per-app Postgres database + role (needs `pg` + `POSTGRES_ADMIN_URL`). |
| `ENABLE_GITHUB_DEPLOYS` | Deploy-on-push webhook (needs `GITHUB_WEBHOOK_SECRET`). |
| `ENABLE_NOTIFICATIONS` | Outbound webhook alerts (needs `NOTIFY_WEBHOOK_URL`). |
| `ENABLE_BACKUP_SCHEDULER` | Periodic backups (manual backup is always available). |

## Project layout

```
api/         Fastify API — auth, deploy pipeline, lifecycle, routing, logs,
             metrics, audit, reconciliation, backups, gated V2 routes
  src/app.js   buildApp() — assembles the app (injectable in tests)
  src/routes/  HTTP/WS endpoints           src/services/  docker, proxy, caddy,
  src/util/    pure, unit-tested helpers                  nginx, health, backup,
  test/        node:test unit + integration               notify, reconcile
dashboard/   Vue 3 + Vite PWA (views, components, stores); scripts/ generates art
scripts/     Windows PowerShell ops (setup, deploy, backup, restore, update, checks)
docs/        Architecture, deployment, security, operations, per-feature guides
```

## Operations

- **Status stays honest** — reconciliation corrects each system against real
  Docker state on boot and every `RECONCILE_INTERVAL_SEC`.
- **Backups** — "Back up now" on the Server screen (or `POST /api/server/backup`)
  takes an online SQLite snapshot plus Caddy routes; turn on the scheduler for
  periodic runs. Full-volume/offsite backups use the PowerShell scripts.
- **Recovery** — see [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md).

## Production (Windows)

The target is a Windows host with Docker Desktop (WSL2, Linux containers). The
step-by-step guide is [`docs/WINDOWS_DEPLOYMENT.md`](docs/WINDOWS_DEPLOYMENT.md),
with PowerShell scripts in [`scripts/`](scripts) (`setup`, `deploy`, `backup`,
`restore`, `update`, `check-systems-health`, `check-firewall`,
`verify-hardening`). Data lives under `C:\ProgramData\SYSTEMS`. Linux is the
development path.

The pieces that only a live box can prove — Docker, Caddy, optional Postgres,
HTTPS, DNS —
say "requires host validation" in the UI and docs until you've run them on the
actual machine. The [Windows checklist](docs/WINDOWS_VALIDATION_CHECKLIST.md) is
the punch list.

The root [`docker-compose.yml`](docker-compose.yml) is the older Linux/dev nginx
stack. It does not represent the Windows + Caddy production topology and only
passes the small environment subset declared in that file. Use the Windows
scripts and guide for the production path.

## Security

SYSTEMS. controls Docker, the reverse proxy, uploaded code, env vars, routes, and
logs, so it runs privileged. Keep it private, never expose the Docker socket, the
proxy admin API, or the database to the internet, and treat uploaded code as
untrusted. It's built to be hardened and least-privilege — not "unhackable." See
[`docs/SECURITY.md`](docs/SECURITY.md).

## FAQ

**Can other people sign up?** No. There's no public signup and a hard cap of two
admins — it's your control panel, not a service.

**What can I deploy today?** Vue/Vite and static-site zips, built and served
automatically. Node APIs, background workers, custom Dockerfiles, per-app
Postgres, GitHub deploy-on-push, and 2 GB chunked uploads are all built and wired,
off by default behind `.env` flags until you validate them on the host.

**What does it cost?** Nothing — it's yours. You bring a server (a Windows host
with Docker Desktop / WSL2) and a wildcard DNS record.

**Is it production-ready?** It's a 2.0 release candidate: the code is here and
tested, and the live pieces (Caddy, optional per-app Postgres, HTTPS) remain
pending validation on a real host — see the
[Windows checklist](docs/WINDOWS_VALIDATION_CHECKLIST.md).

**Linux?** Linux is the dev path (nginx + SQLite); Windows + Caddy is the
production target. The control-plane store remains SQLite; Postgres is optional
for databases provisioned to deployed apps.

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
- [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) — accessibility posture & checklist
- [`docs/adr/`](docs/adr/README.md) — architecture decision records
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, PR flow, and standards
- [`docs/V2_ROADMAP.md`](docs/V2_ROADMAP.md) — where this came from and where it's going
- Optional features (off by default): [`DATABASES`](docs/DATABASES.md) · [`LARGE_UPLOADS`](docs/LARGE_UPLOADS.md) · [`DOCKERFILE_MODE`](docs/DOCKERFILE_MODE.md) · [`WORKERS`](docs/WORKERS.md) · [`GITHUB_DEPLOYS`](docs/GITHUB_DEPLOYS.md) · [`NOTIFICATIONS`](docs/NOTIFICATIONS.md) · [`SHELL_CONSOLE`](docs/SHELL_CONSOLE.md)

## License

[MIT](LICENSE) © Acronym ([acronym.sk](https://acronym.sk)). Use it, fork it,
ship it.
