# SYSTEMS. — Disaster Recovery (Windows)

What to do when something breaks on Windows. Don't paste secrets into any command.

The tools you'll reach for: the SYSTEMS. **Server** screen (including **Back up
now**, an online snapshot of the database + Caddy routes),
`scripts\check-systems-health-windows.ps1`, `scripts\check-firewall-windows.ps1`,
`scripts\restore-systems-windows.ps1`, Docker Desktop, and PowerShell.

Two backup paths complement each other: the in-app online snapshot (quick,
consistent DB + routes; one click or `POST /api/server/backup`, plus an optional
scheduler) and the PowerShell scripts (full-volume / offsite). Restore runs
through `restore-systems-windows.ps1`.

General first move for almost everything:
```powershell
.\scripts\check-systems-health-windows.ps1
docker ps -a
```

---

### 1. Dashboard unreachable
- **Symptoms:** `systems.acronym.sk` times out / 502.
- **Cause:** API/dashboard container down, or Caddy down/misrouted.
- **Check:** Server screen (if it loads); `docker ps`; `docker logs <api>`.
- **Recover:** `docker compose up -d`; if Caddy down see §2; verify DNS §13.
- **Prevent:** health checks; restart policy `unless-stopped`.

### 2. Caddy down
- **Symptoms:** all sites (incl. dashboard) fail TLS/refuse.
- **Cause:** service stopped / container crashed / bad config.
- **Check:** `Get-Service caddy` or `docker ps | findstr caddy`; `caddy validate`.
- **Recover:** `Restart-Service caddy` or `docker compose up -d caddy`; if config invalid see §3.
- **Prevent:** validate before reload; keep last-good `Caddyfile` in backups.

### 3. Caddy reload fails / config invalid
- **Symptoms:** reload errors; new route not live; event `caddy_validate_failed`.
- **Cause:** malformed generated route file.
- **Check:** `caddy validate --config <Caddyfile>`; inspect newest `systems.d\*.caddy`.
- **Recover:** remove/fix the offending route file; reload; restore routes from backup if needed.
- **Prevent:** SYSTEMS. validates the config before it reloads.

### 4. HTTPS certificates fail / not issued
- **Symptoms:** browser TLS warning; Caddy ACME errors.
- **Cause:** port 443 blocked, DNS wrong, rate limits.
- **Check:** firewall 443 (`check-firewall-windows.ps1`); DNS §13; Caddy logs.
- **Recover:** open 443; fix DNS; let Caddy retry ACME.
- **Prevent:** verify DNS + firewall before go-live.

### 5. Docker Desktop down
- **Symptoms:** Server shows Docker **Not connected**; event `docker_unavailable`.
- **Cause:** Docker Desktop not running / WSL2 stopped.
- **Check:** Docker Desktop tray; `docker info`.
- **Recover:** start Docker Desktop; `wsl --shutdown` then restart if WSL wedged.
- **Prevent:** set Docker Desktop to start at login.

### 6. WSL2 broken / unavailable
- **Symptoms:** Docker won't start; WSL errors.
- **Cause:** WSL not installed / nested virt disabled / kernel update needed.
- **Check:** `wsl --status`, `wsl --update`.
- **Recover:** `wsl --update`; enable nested virtualization on the VPS (§ Windows VPS).
- **Prevent:** confirm nested virt before provisioning.

### 7. Container stuck / restarting
- **Symptoms:** a system flaps Building/Failed.
- **Cause:** crash loop, bad build, OOM (hit memory limit).
- **Check:** `docker logs <name>`; Server defaults; system **Logs** tab.
- **Recover:** Stop, fix, Redeploy or **Roll back**; raise limits if OOM.
- **Prevent:** resource defaults + health checks.

### 8. Postgres down
- **Symptoms:** Server DB **Not connected**; event `postgres_unavailable`.
- **Cause:** container stopped / volume issue.
- **Check:** `docker ps | findstr postgres`; `docker logs <pg>`.
- **Recover:** `docker compose up -d postgres`; if data issue see §9.
- **Prevent:** backups; healthcheck; never expose 5432.

### 9. Postgres data corrupted
- **Symptoms:** DB errors, won't start.
- **Cause:** unclean shutdown / disk fault.
- **Check:** `docker logs <pg>`.
- **Recover:** `restore-systems-windows.ps1` (restores newest pg_dump). **Type `RESTORE`.**
- **Prevent:** regular backups; UPS; disk monitoring.

### 10. Disk full
- **Symptoms:** writes/builds fail; event `disk_warning`.
- **Cause:** logs/releases/old images/backups accumulation.
- **Check:** Server → Disk; `docker system df`.
- **Recover:** apply retention; remove old releases/logs; **scoped, confirmed** image cleanup (no blind `docker system prune`).
- **Prevent:** retention defaults; disk warnings at 75/90%.

### 11. Bad deployment breaks a project
- **Symptoms:** a system errors after redeploy.
- **Check:** **Logs** tab; **Deployments** tab.
- **Recover:** **Roll back to previous** (instant — previous image retained).
- **Prevent:** verify after redeploy; keep ≥1 prior release.

### 12. Health check fails
- **Symptoms:** Health not green.
- **Check:** system **Logs**; health path/port config.
- **Recover:** fix app or health path; restart.
- **Prevent:** correct health path per system.

### 13. DNS not pointing
- **Symptoms:** domain doesn't resolve to server.
- **Check:** `Resolve-DnsName systems.acronym.sk`; compare to `SERVER_IP`.
- **Recover:** fix Websupport `A` records; wait for propagation.
- **Prevent:** confirm DNS before deploy.

### 14. Wildcard subdomains fail
- **Symptoms:** `slug.acronym.sk` doesn't resolve.
- **Check:** `Resolve-DnsName test.acronym.sk`; verify `A *.acronym.sk`.
- **Recover:** add/fix the wildcard record.
- **Prevent:** the wildcard is mandatory; document it.

### 15. Deployment fails halfway
- **Symptoms:** build errors; partial container/route.
- **Check:** Ship build log; `docker ps -a`.
- **Recover:** SYSTEMS. cleans temp extraction + failed image; retry. Remove orphan container/route if needed.
- **Prevent:** build timeouts; zip validation.

### 16. Windows machine reboots
- **Symptoms:** everything offline after reboot.
- **Recover:** ensure Docker Desktop autostarts; `docker compose up -d`; verify health.
- **Prevent:** Docker Desktop start-at-login; restart policy `unless-stopped`.
- **Note:** on boot SYSTEMS. reconciles each system's status against real Docker
  state (and re-checks every `RECONCILE_INTERVAL_SEC`), so the dashboard
  self-corrects stale "running"/"stopped" badges rather than showing them frozen.

### 17. Server migrated to a new machine
- **Recover:** install prereqs (§ Windows deployment); copy `.env` **securely**; restore newest backup with `restore-systems-windows.ps1`; repoint DNS to the new `SERVER_IP`; verify.
- **Prevent:** keep `.env` + backups off-box and secure.

### 18. Admin password lost
- **Symptoms:** can't sign in.
- **Recover:** use the second admin to reset (Admin → Administrators). If both lost: set a fresh `ADMIN_USERS`/`ADMIN_EMAIL` in `.env` and restart so the admin is reseeded.
- **Prevent:** always keep two admins; store credentials in a password manager.

### 19. Route file wrong
- **Symptoms:** a system routes to the wrong place / 404.
- **Check:** inspect `systems.d\{slug}.caddy`.
- **Recover:** regenerate from SYSTEMS. (re-save/redeploy) or restore routes from backup; reload Caddy.
- **Prevent:** validate before reload.

### 20. Backup restore needed
- **Recover:** `restore-systems-windows.ps1 [-BackupPath <dir>]`, **type `RESTORE`**. Restores DB + routes + releases, reloads Caddy, restarts services, verifies.
- **Prevent:** test a restore periodically.

### 21. Accidental purge / delete
- **Symptoms:** a system is gone.
- **Recover:** restore from the most recent backup that still contains it.
- **Prevent:** delete requires typing the **slug**; take a backup before destructive actions. A separate delete-vs-**purge** split with stronger confirmation isn't built yet.

---

**Before any destructive action** (purge, delete-all-releases, DB reset/delete,
remove routes, major update/migration, restore): SYSTEMS. shows what will be
removed, whether a recent backup exists and when, and warns harder if none
exists. Purge/DB actions require typing the slug or database name. Taking a
fresh snapshot first is one click — **Server → Back up now**.
