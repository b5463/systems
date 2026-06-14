# SYSTEMS. — Backups & Restore

> Status: **scripts implemented & dry-run-capable**; actual Postgres dump /
> Caddy reload / service restart **require the Windows host**. Local-only
> backups are **not** disaster-proof — keep secure **off-server** copies.

## Scripts
- `scripts\backup-systems-windows.ps1` — `[-IncludeLogs] [-IncludeUploads] [-DryRun]`
- `scripts\restore-systems-windows.ps1` — `[-BackupPath <dir>] [-DryRun]` (types `RESTORE` to confirm)

## What a backup includes
- **Database** — `pg_dump` of the SYSTEMS Postgres (admins, systems, deployments/
  releases, events/audit, env-var metadata, route records, settings, health/
  metrics snapshots). On V1.1 SQLite it copies `platform.db` (+WAL/SHM).
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
The UI warns that no automatic pre-action backup is taken — back up first.

See also: [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md), [`OPERATIONS.md`](OPERATIONS.md).
