# SYSTEMS. — Roadmap

This is the staged plan the project followed, kept as history plus where things
stand now. Each stage was meant to be shippable and reviewable on its own, with
the dangerous backend and server changes isolated rather than bundled in.

**Where it's at:** 2.0 release candidate (`2.0.0-rc.1`). The "V2 features" below
are built and wired, just off by default behind their `.env` flags. Caddy and
optional per-system Postgres provisioning are wired pending validation on the
real Windows host; the control-plane database remains SQLite. Since the
feature work landed there's also been a hardening, UX, and maintainability pass
(see "2.0-rc — hardening, UX & maintainability" below).

A separate macOS Docker Desktop topology now covers cross-platform local testing on
Apple Silicon and Intel. It proves the Linux-container deploy, local nginx route,
health, redeploy, and rollback path; public Caddy, DNS, and TLS remain Windows-host
validation work. See [`MACOS_TESTING.md`](MACOS_TESTING.md).

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
slug); deploy-history retention (old history rows trimmed; images kept for
rollback); deploy type recorded; and the UI wiring for all of it (Ship
visibility, System detail health/visibility/purge, Systems truth plus the
deleted section).

Other pieces from this stage:

- SQLite control-plane DB; a Postgres/Prisma cutover is documented as a
  migration plan, not implemented.
- Caddy reverse proxy: `Caddyfile` plus generated `systems.d/` route files;
  automatic HTTPS; certbot removed.
- Schema: `visibility` (public / password / private), `deploy_type`, an explicit
  `routes` table, persisted editable settings.
- Visibility modes: public route, password-protected (basic auth where safe),
  private (no public route).
- Auth uses HttpOnly/SameSite cookie sessions (Secure + __Host- in production), session-bound CSRF, strict Origin checks, rotation/revocation, login backoff, and a persistent operator IP denylist.
- Build timeouts and resource-limit enforcement; the delete-vs-purge split.
- Windows-first server deployment guide and `.env`.

Still needs the Windows host to confirm (can't be exercised without Docker):

- Container naming `deploy_{slug}` with Caddy reaching the mapped host port via
  `SYSTEMS_APP_UPSTREAM_HOST`; the Caddy and optional Postgres service wiring.
- The SQLite-to-Postgres internal-store cutover (currently a design plan only;
  implement and test a runner as a dedicated, backed-up migration).
- Live Caddy reload/validate plus end-to-end HTTPS issuance.

## V1.5 — More runtimes (built, host-validation pending)

- Node API / worker deploys (long-running services): the build-and-run path is
  in; proving it end-to-end needs the Windows host.
- Custom Dockerfile support: built, admin-only, off by default
  (`ENABLE_DOCKERFILE_MODE`).

## V2 — Full deployment engine

The original target list (built items struck through; see "what's actually
built" below for the gating detail):

- ~~2 GB streaming/chunked uploads.~~ **Built** (off by default).
- ~~Managed databases for systems.~~ **Built** (off by default).
- ~~Workers/bots (non-HTTP long-running processes).~~ **Built** (host-validation pending).
- ~~GitHub deploys (push-to-deploy).~~ **Built** (off by default — riskiest flag).
- ~~Backups and restores (DB plus per-system).~~ **Built and on.**
- ~~In-dashboard shell console (beyond per-container exec).~~ **Built** (off by default).
- Advanced metrics and alerting — ~~threshold alerting~~ **done**; longer metrics
  history still pending.

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
revocation via `token_version`. One system can be made **primary** so the bare
root domain (e.g. `acronym.sk`) serves it while the dashboard stays on its
subdomain (`PATCH /api/projects/:slug/primary`). See [`BACKUPS.md`](BACKUPS.md),
[`OPERATIONS.md`](OPERATIONS.md), and [`SECURITY.md`](SECURITY.md).

Engineering and product: the API is assembled by `buildApp()` and covered by
route-level integration tests (`app.inject`) on top of the pure-logic unit tests.
The login and empty-state art is a generated pastel ribbon field.

Gated in the deploy and exec paths: Dockerfile mode (off by default, never
silent) and the shell console (off by default). The V2 feature flags show on the
Server screen, and `/api/deploy/plan` gives a dry-run.

Still needs Windows host validation: the Node-API/worker container runtime plus
Caddy reachability, Dockerfile builds, and the risky flags above run end-to-end
on the host.

## 2.0-rc — hardening, UX & maintainability (done)

A pass after the feature work, driven by deep code/UX audits. All shipped:

Reliability & security:
- Container-state reconciliation also recovers builds left stuck in `building`
  after a process restart.
- Env updates **merge** over the existing vars (and support explicit removal)
  instead of replacing — a full replace was silently wiping un-retyped vars,
  since the API only ever returns key names. Failed env recreates also clear the
  dangling `container_id`.
- Serialized deploy port allocation (no two concurrent deploys grabbing the same
  port); chunked-upload sessions + temp files get a TTL sweeper.
- Basic-auth username validated before it's written into a Caddy route
  (directive-injection guard); equal-time login (no username-enumeration oracle);
  the API refuses to start with the insecure default `JWT_SECRET` in production.
- 2FA enable/disable and password change/reset bump `token_version`, so they
  sign other sessions out. DB indexes for the hot lookups; `stats_history`
  retention pruning.

UX & feel:
- Mobile **bottom tab bar** (replaced the hamburger drawer); keyboard shortcuts
  with a `?` help overlay; optimistic start/stop/restart; success/failure toasts
  on the actions that change live state; copy buttons on secrets/IDs.
- Reusable `ConfirmDialog` (delete / purge / redeploy) with focus management;
  redeploy now has a confirm step; route transitions; Systems search + sort.
- "Crashed" (ran then died) vs "Failed" (build) vocabulary; richer empty states;
  an incident-recovery callout with one-click View logs / Restart / Redeploy /
  Roll back; onboarding empty state; Server screen framed so "Set up on host" /
  "Not measured yet" don't read as breakage.

Maintainability & tooling:
- Shared API helpers (`pub`, `loadOr404`) and frontend `config` / `date` /
  `status` utilities; `readUploadToTmp`; the Settings tab extracted into a
  `SystemSettings` component.
- ESLint + Prettier on both packages (lint clean); route-level integration tests
  via `app.inject` on top of the pure-logic unit tests.

## Not built yet (the honest backlog)

Current backlog status:

- ~~Auth: HTTP-only cookie sessions + CSRF, login lockout/backoff.~~ **Done.**
  Browser JWT exposure and query/bearer fallbacks are removed; mutations require
  a session-bound CSRF header; Origin is checked; sensitive changes rotate sessions.
  A persistent audited IP denylist (exact IP **and CIDR range**) is enforced
  pre-auth through the admin API, and every response carries hardened headers
  (locked-down CSP, HSTS in production, frame-deny, nosniff, Referrer/Permissions
  policies).
- ~~Per-build resource ceilings and a concurrent-build cap.~~ **Done.**
  `MAX_CONCURRENT_BUILDS` gates admission (default one), while
  `BUILD_CPU_LIMIT`, `BUILD_MEMORY_MB`, and `BUILD_TIMEOUT_SECONDS` bound each
  Docker build.
- Per-system resource overrides in the UI — `util/limits.js` already accepts
  them; the store and UI don't exist yet.
- ~~Automated disk cleanup~~ — **Done.** `POST /api/server/cleanup` removes
  orphaned managed images and release dirs without touching rollback targets.
  Preview via `GET /api/server/cleanup/preview`; surfaced on the Server screen.
- Persisted, editable settings in Admin (still `.env`-driven).
- ~~Threshold alerting~~ — **Done.** `evaluateAlerts` checks disk %, backup age,
  Docker, and Postgres on every reconcile cycle; `alertDelta` fires a webhook
  only on first-seen transitions (raised → notify, not every poll). Full metrics
  history still pending.

## UX polish backlog (nice-to-have)

Low-impact niceties, consciously deferred — worth doing but not worth churning
working code for right now:

- ~~Clarify the Ship deploy-lifecycle rail~~ — **Done.** It is explicitly labeled
  as a pipeline reference and directs operators to the build log for live state.
- ~~Per-cell tooltips / a small legend on the Overview truth grid.~~
  **Done.** Every cell explains its source and neutral/not-applicable states.
- ~~Co-locate Purge next to Delete~~ — **Done.** Both appear in the Overview and
  Settings danger areas, with the recoverable-delete/permanent-purge distinction.
- ~~First-run framing on the login screen~~ — **Done.** The login explains that
  the initial administrator comes from `ADMIN_USERS` and that signup is closed.
- ~~Pair Failed/Crashed cards with a next action~~ — **Done.** Attention cards
  direct the operator to logs and the appropriate restart, redeploy, or rollback.

## v2.5 — Finish and harden the single host

Theme: once the Windows host validation is done, take everything that's wired
into something you'd trust in production on one box. Mostly closing the backlog
above, in priority order:

- ~~**Auth hardening:** cookie sessions + CSRF, login lockout/backoff.~~ **Done.**
  Also includes strict Origin checks, session rotation/revocation, no bearer/query
  fallback, 15-character password minimums, safe proxy-trust defaults, exact-IP
  and CIDR-range IP bans, and hardened response headers (CSP/HSTS/frame-deny/nosniff).
- ~~**Build safety:** enforce build timeouts, concurrent-build admission, and
  per-build resource ceilings.~~ **Done.**
- **Per-system limits in the UI:** wire CPU/memory/PIDs/restart/log/health-path
  overrides to the existing limits mapping.
- ~~**Disk hygiene:** safe pruning of old images/releases without touching rollback
  targets, surfaced on Server.~~ **Done.**
- **Settings out of `.env`:** DB-backed, editable settings where it's safe to.
- **Observability:** longer metrics history remains. ~~Threshold alerts for disk,
  backup age, Docker, and Postgres transitions routed through notifications.~~ **Done.**
  Health/resource-pressure alert coverage is still pending.
- **Polish the gated features:** flip them on after host validation with the UX
  rough edges sanded — GitHub deploy status in the UI, notification formatting
  for Slack/Discord/email, large-upload progress.

## v3 — Beyond one box

Theme: from a private single-host engine to something a small team can run at
scale. These are the real architectural leaps, each big enough to stage on its
own:

- **Multi-node:** per-node Docker + Caddy, a scheduler/placement layer, node
  health, and route distribution across hosts.
- **Zero-downtime deploys:** blue/green or rolling cutover gated on a health
  check, instead of today's stop-old-then-start-new.
- **Preview environments:** ephemeral per-branch/PR deploys, building on the
  GitHub integration.
- **Roles and SSO:** move past the two-admin cap to scoped roles
  (owner/admin/viewer) and OIDC/SSO login.
- **Secrets management:** a real per-system secrets store with rotation, beyond
  env-var encryption.
- **Build pipeline:** build cache, selectable runtimes/versions, and a build
  queue/farm so deploys don't contend for the host.
- **Backups/DR at scale:** offsite/object-storage targets, scheduled restore
  drills, and point-in-time recovery for Postgres.
- **API + CLI:** scoped API tokens and a `systems` CLI so CI can deploy without
  the dashboard.
