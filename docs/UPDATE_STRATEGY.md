# SYSTEMS. — Update Strategy

Updating SYSTEMS. itself, safely, on Windows. There's no auto-update; every
update needs explicit admin approval. The script is
[`..\scripts\update-systems-windows.ps1`](../scripts/update-systems-windows.ps1).

## Principle
Back up first, update second, verify third, roll back if anything fails.
`update-systems-windows.ps1` enforces this order and stops on the first error.

## Procedure
1. **Check current version/commit** — `git rev-parse --short HEAD` (the script prints it).
2. **Create a backup first** — `backup-systems-windows.ps1` (the update script runs this unless `-SkipBackup`):
   - Postgres dump (or SQLite copy)
   - Caddy route files + `Caddyfile`
   - release files / metadata
3. **Pull/update code** — `git pull --ff-only`.
4. **Install dependencies** — API (`npm install --production`) + dashboard (`npm install`).
5. **Build** — `npm run build` (dashboard).
6. **Run migrations** — the Postgres migration runner on the production store; SQLite migrations are idempotent on boot.
7. **Restart services** — `docker compose up -d --build`.
8. **Reload Caddy** — `caddy reload` (service) or via container.
9. **Verify:**
   - `https://systems.acronym.sk` reachable
   - admin login works
   - Postgres connected (or SQLite OK)
   - Docker access OK
   - Caddy route generation OK
   - one **existing** deployed system still serves
   - one **test** deployment succeeds
10. **Roll back if it fails** (see below).

## Rollback
The update script prints these on failure:
1. `git checkout <previous-commit>`
2. `restore-systems-windows.ps1` (restores the pre-update backup)
3. `deploy-systems-windows.ps1`
4. `check-systems-health-windows.ps1`

## Rules
- No auto-update. The script requires typing `UPDATE` to proceed.
- Stop immediately if build or migration fails — do not restart services on a broken build.
- Never destroy current deployments during an update.
- Emit events: `update_started`, `update_completed`, `update_failed`.
