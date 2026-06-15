# SYSTEMS. — Roadmap

A staged plan. Each stage is shippable and reviewable on its own. Dangerous
backend/server changes are isolated, never bundled.

## V1.1 — Foundation / product shell ✅ (this pass)

- Rebrand to **SYSTEMS. by Acronym**; monochrome-first operational design base.
- Responsive product shell: desktop sidebar + mobile hamburger/drawer.
- Five surfaces — Systems, Ship, Events, Server, Admin — plus System detail
  (Overview/Deployments/Logs/Metrics/Console/Settings) with a status truth model
  and grouped primary/secondary/danger actions.
- Honest empty / loading / error states. No faked data or statuses.
- PWA rebrand (manifest, icons, meta). Read-only Server status endpoint.
- Docs, security direction, and config skeletons.
- Backend kept functional (SQLite + nginx) — no rushed migrations.

## V1.1.5 — Windows target + hardening baseline ✅ (this pass)

- Windows-first `.env`, paths (`C:\ProgramData\SYSTEMS`), and docs
  (WINDOWS_DEPLOYMENT, UPDATE_STRATEGY, DISASTER_RECOVERY; firewall in
  SECURITY/OPERATIONS).
- PowerShell scripts: setup, deploy, backup, restore, update, health, firewall.
- Per-deployed-container resource limits (memory/CPU/PIDs/restart/log rotation)
  from `DEFAULT_CONTAINER_*`.
- SYSTEMS. self-observability on the Server screen (uptime, disk, backups,
  defaults) — real data, nothing faked.
- Destructive delete requires typing the system slug; backup-awareness before
  destructive actions.

## V1.2 — Working deployment platform (in progress)

**Implemented & verifiable (this pass):** slug rules + reserved-name list;
reverse-proxy abstraction with a real Caddy route-file generator (public /
password basic-auth / private) selected by `REVERSE_PROXY`; visibility model
(schema + endpoint + deploy logic; private = no route); health + HTTPS checker
(real request, honest states) + endpoint; delete-vs-purge (purge requires
typing the slug); release-retention pruning; deploy type recorded; UI wiring
for all of the above (Ship visibility, System detail health/visibility/purge,
Systems truth + deleted section).

**Remaining (validate on the Windows host — cannot be exercised Docker-less):**
- Container naming `systems-{slug}` on a shared Caddy network (ICC) so Caddy
  reaches apps by name; Caddy + Postgres compose/service wiring.
- SQLite → Postgres internal-store cutover (schema is Postgres-ready; do it as a
  dedicated, backed-up migration).
- Live Caddy reload/validate + HTTPS issuance verification end-to-end.

Built on the Windows choices above:


- **Postgres** internal DB + SQLite→Postgres migration script.
- **Caddy** reverse proxy: `Caddyfile` + generated `systems.d/` route files;
  automatic HTTPS; remove certbot.
- Schema: `visibility` (public / password / private), `deploy_type`, explicit
  `routes` table, persisted editable settings.
- Visibility modes: public route, password-protected (basic auth if safe),
  private (no public route).
- **Auth hardening:** HTTP-only cookie sessions + CSRF, login lockout.
- Build timeouts + resource limits enforcement; delete vs **purge** split.
- Windows-first server deployment guide & `.env`.

## V1.5 — More runtimes (if safe)

- Node API deploys (long-running services).
- Custom Dockerfile support — advanced, admin-only, explicit opt-in.

## V2 — Full deployment engine

- 2 GB streaming / chunked uploads.
- Managed databases for systems.
- Workers / bots (non-HTTP long-running processes).
- GitHub deploys (push-to-deploy).
- Backups & restores (DB + per-system).
- In-dashboard shell console (beyond per-container exec).
- Advanced metrics & alerting.

---

*Art direction and the Windows-target lock are handled in their own dedicated
prompts before the V1.2 engine work.*

## V2 — what's actually built so far

**Wired up, off by default (enable after host validation):** chunked/streamed
2 GB uploads (`ENABLE_LARGE_UPLOADS`), per-system Postgres provisioning
(`ENABLE_DB_PROVISIONING`), GitHub deploy-on-push (`ENABLE_GITHUB_DEPLOYS` —
verifies the webhook HMAC, then pulls and builds external code, so it's the
riskiest flag), and outbound webhook notifications (`ENABLE_NOTIFICATIONS` +
`NOTIFY_WEBHOOK_URL`). See the per-feature docs for each.

**Wired up:** in-app backups — a manual "Back up now" (online SQLite snapshot +
optional Caddy routes copy) is always available, with an optional periodic
scheduler (`ENABLE_BACKUP_SCHEDULER`). Container-state reconciliation runs on
boot and on an interval so crashes/reboots don't leave stale "running" rows.
Admin auth supports opt-in TOTP two-factor and JWT session revocation via
`token_version`. See [`BACKUPS.md`](BACKUPS.md), [`OPERATIONS.md`](OPERATIONS.md),
[`SECURITY.md`](SECURITY.md).

**Gated in the deploy/exec paths:** Dockerfile mode (off by default, never
silent), shell console (off by default). **Shown in the UI:** V2 feature flags on
the Server screen; `/api/deploy/plan` dry-run.

**Still requires Windows host validation:** Node-API/worker container runtime +
Caddy reachability, Dockerfile builds, and the risky flags above exercised
end-to-end on the host.

**Planned only:** multi-server (per-node Docker/Caddy, scheduling, node health,
route distribution — docs/architecture notes only).
