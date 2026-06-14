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
  defaults) — honest, never faked.
- Destructive delete requires typing the system slug; backup-awareness before
  destructive actions.

## V1.2 — Platform alignment (the dangerous, deliberate migrations)

Now built on the Windows choices above:


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
