# SYSTEMS. — Backups & Restore

Two backup paths: an in-app backup for quick, consistent DB snapshots, and the
PowerShell scripts for full-volume/offsite backups. A backup that only lives on
the same disk won't save you when the disk dies, so keep a copy somewhere else.

## In-app backup
A Node-native backup runs inside SYSTEMS. itself. It takes an online SQLite
snapshot (`better-sqlite3` `.backup()`, safe under WAL), optionally copies the
Caddy routes (`CADDY_ROUTES_DIR`), writes them into a timestamped folder under
`BACKUP_DIR`, writes a `manifest.json`, and prunes beyond `BACKUP_RETENTION`
(default 14).

- **Manual** — always available from the dashboard **Server** page via the
  **Back up now** button → `POST /api/server/backup`.
- **Scheduled** — a periodic run every `BACKUP_INTERVAL_HOURS` (default 24),
  only when `ENABLE_BACKUP_SCHEDULER=true`.

It's meant for quick, consistent DB snapshots; the PowerShell scripts below
remain the way to capture full volumes and ship them offsite.

Code: `api/src/services/backup.js`, `api/src/util/backup.js`.

## Scripts
- `scripts\backup-systems-windows.ps1` — `[-IncludeLogs] [-IncludeUploads] [-DryRun]`
- `scripts\restore-systems-windows.ps1` — `[-BackupPath <dir>] [-DryRun]` (types `RESTORE` to confirm)

## What a backup includes
- **Database** — `pg_dump` of the SYSTEMS Postgres (admins, systems, deployments/
  releases, events/audit, env-var metadata, route records, settings, health/
  metrics snapshots). On SQLite it copies `platform.db` (+WAL/SHM).
- **Caddy** — `C:\ProgramData\SYSTEMS\caddy\Caddyfile` + `systems.d\*.caddy`
- **Releases** — `C:\ProgramData\SYSTEMS\releases`
- **Optional** — `logs`, `uploads` (`-IncludeLogs` / `-IncludeUploads` or `BACKUP_INCLUDE_*`)
- A no-secrets `manifest.json` (timestamp, db type, what's included)

## What a backup does NOT include
- **`.env` / secrets** — deliberately excluded so secrets never land in an
  archive. Back `.env` up **separately and securely**. **`ENV_SECRET` loss =
  encrypted env vars are unrecoverable.**
- `docker-compose.yml` / production config — it lives in the git repo; keep a
  copy with your infra notes.
- Docker images — rebuilt from releases on restore/redeploy.

## Retention
`BACKUP_RETENTION_DAYS` (default 14). Old timestamped folders are pruned.

## How to run a backup
```powershell
.\scripts\backup-systems-windows.ps1 -DryRun     # see exactly what would be captured
.\scripts\backup-systems-windows.ps1             # write a timestamped backup
```

## How to restore
```powershell
.\scripts\restore-systems-windows.ps1 -DryRun                 # show plan, change nothing
.\scripts\restore-systems-windows.ps1 -BackupPath <dir>       # type RESTORE to confirm
```
Restore replaces DB + routes + releases, reloads Caddy and restarts services
where available, then verifies health.

## Before destructive actions
Delete keeps history; **purge** and DB reset/delete require typing the slug.
The UI warns that no automatic pre-action backup is taken, so back up first.

See also: [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md), [`OPERATIONS.md`](OPERATIONS.md).
