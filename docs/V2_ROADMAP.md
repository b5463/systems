# SYSTEMS. — Roadmap

This is the staged plan the project followed, kept as history plus where things
stand now. Each stage was meant to be shippable and reviewable on its own, with
the dangerous backend and server changes isolated rather than bundled in.

**Where it's at:** 2.0 release candidate (`2.0.0-rc.1`). The "V2 features" below
are built and wired, just off by default behind their `.env` flags. Caddy and
Postgres are wired too, pending validation on the real Windows host.

## V1.1 — Foundation / product shell (done)

- Rebrand to SYSTEMS.; monochrome-first operational design base.
- Responsive product shell: desktop sidebar plus mobile hamburger/drawer.
- Five surfaces (Systems, Ship, Events, Server, Admin) plus System detail
  (Overview/Deployments/Logs/Metrics/Console/Settings), with a status truth
  model and grouped primary/secondary/danger actions.
- Honest empty, loading, and error states. No faked data or statuses.
- PWA rebrand (manifest, icons, meta). Read-only Server status endpoint.
- Docs, security direction, and config skeletons.
- Backend kept functional (SQLite + nginx), no rushed migrations.

## V1.1.5 — Windows target + hardening baseline (done)

- Windows-first `.env`, paths (`C:\ProgramData\SYSTEMS`), and docs
  (WINDOWS_DEPLOYMENT, UPDATE_STRATEGY, DISASTER_RECOVERY; firewall in
  SECURITY/OPERATIONS).
- PowerShell scripts: setup, deploy, backup, restore, update, health, firewall.
- Per-container resource limits (memory/CPU/PIDs/restart/log rotation) from
  `DEFAULT_CONTAINER_*`.
- SYSTEMS. self-observability on the Server screen (uptime, disk, backups,
  defaults) with real data, nothing faked.
- Destructive delete requires typing the system slug; backup-awareness before
  destructive actions.

## V1.2 — Working deployment platform

Built and verifiable: slug rules plus a reserved-name list; the reverse-proxy
abstraction with a real Caddy route-file generator (public / password basic-auth
/ private) selected by `REVERSE_PROXY`; the visibility model (schema, endpoint,
deploy logic, private = no route); the health and HTTPS checker (real request,
honest states) and its endpoint; delete-vs-purge (purge requires typing the
slug); release-retention pruning; deploy type recorded; and the UI wiring for
all of it (Ship visibility, System detail health/visibility/purge, Systems truth
plus the deleted section).

Other pieces from this stage:

- Postgres internal DB plus the SQLite-to-Postgres migration script.
- Caddy reverse proxy: `Caddyfile` plus generated `systems.d/` route files;
  automatic HTTPS; certbot removed.
- Schema: `visibility` (public / password / private), `deploy_type`, an explicit
  `routes` table, persisted editable settings.
- Visibility modes: public route, password-protected (basic auth where safe),
  private (no public route).
- Auth hardening: HTTP-only cookie sessions plus CSRF, login lockout.
- Build timeouts and resource-limit enforcement; the delete-vs-purge split.
- Windows-first server deployment guide and `.env`.

Still needs the Windows host to confirm (can't be exercised without Docker):

- Container naming `systems-{slug}` on a shared Caddy network (ICC) so Caddy
  reaches apps by name; the Caddy and Postgres compose/service wiring.
- The SQLite-to-Postgres internal-store cutover (schema is Postgres-ready; do it
  as a dedicated, backed-up migration).
- Live Caddy reload/validate plus end-to-end HTTPS issuance.

## V1.5 — More runtimes

- Node API deploys (long-running services).
- Custom Dockerfile support: advanced, admin-only, explicit opt-in.

## V2 — Full deployment engine

The original target list:

- 2 GB streaming/chunked uploads.
- Managed databases for systems.
- Workers/bots (non-HTTP long-running processes).
- GitHub deploys (push-to-deploy).
- Backups and restores (DB plus per-system).
- In-dashboard shell console (beyond per-container exec).
- Advanced metrics and alerting.

## V2 — what's actually built

Wired up, off by default (enable after host validation): chunked/streamed 2 GB
uploads (`ENABLE_LARGE_UPLOADS`), per-system Postgres provisioning
(`ENABLE_DB_PROVISIONING`), GitHub deploy-on-push (`ENABLE_GITHUB_DEPLOYS`,
which verifies the webhook HMAC and then pulls and builds external code, so it's
the riskiest flag), and outbound webhook notifications (`ENABLE_NOTIFICATIONS`
plus `NOTIFY_WEBHOOK_URL`). See the per-feature docs for each.

Wired up and on: in-app backups, with a manual "Back up now" (online SQLite
snapshot plus an optional Caddy routes copy) always available and an optional
periodic scheduler (`ENABLE_BACKUP_SCHEDULER`). Container-state reconciliation
runs on boot and on an interval, so crashes and reboots don't leave stale
"running" rows. Admin auth supports opt-in TOTP two-factor and JWT session
revocation via `token_version`. See [`BACKUPS.md`](BACKUPS.md),
[`OPERATIONS.md`](OPERATIONS.md), and [`SECURITY.md`](SECURITY.md).

Gated in the deploy and exec paths: Dockerfile mode (off by default, never
silent) and the shell console (off by default). The V2 feature flags show on the
Server screen, and `/api/deploy/plan` gives a dry-run.

Still needs Windows host validation: the Node-API/worker container runtime plus
Caddy reachability, Dockerfile builds, and the risky flags above run end-to-end
on the host.

Planned only: multi-server (per-node Docker/Caddy, scheduling, node health,
route distribution). This is docs and architecture notes for now.
