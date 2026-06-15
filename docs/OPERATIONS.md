# SYSTEMS. — Operations (day 2)

> The day-to-day: running, watching, and looking after SYSTEMS.

## Daily / at-a-glance

- **Systems** screen — snapshot counts (Live / Building / Stopped / Failed),
  what needs attention, and the latest deploy.
- **Server** screen — Docker / reverse proxy / database / wildcard status.
  Anything SYSTEMS. can't actually observe is shown as *not measured yet*.

## Common tasks

| Task | Where |
| --- | --- |
| Ship a new system | **Ship** → drop zip → build & deploy |
| Restart / stop / start | **System detail → Overview → Actions** |
| Redeploy a new build | System detail → Redeploy (Overview or Deployments) |
| Roll back | System detail → Deployments → Roll back to previous |
| View live logs | System detail → **Logs** |
| Shell into a container | System detail → **Console** (running only) |
| Set env vars | System detail → **Settings** (restarts container) |
| Add the second admin | **Admin → Administrators** |
| Review activity | **Events** (filter by type / system / admin) |

## Lifecycle states

| State | Meaning |
| --- | --- |
| Live (running) | Container up, route active |
| Building | Image building / container starting |
| Stopped | Container exists but not running |
| Failed (error) | Build failed or container crashed |

## Incident response

1. **A system shows Failed** → open it → **Logs** → diagnose → **Restart**, or
   **Roll back** to the last good release.
2. **Docker shows Not connected** on the Server screen → the API can't reach the
   Docker socket; check the API container and socket mount. Deploys/lifecycle
   are unavailable until restored.
3. **Crash toast appears** → a previously-live system stopped unexpectedly;
   investigate via its logs.

## Container-state reconciliation

On boot and every `RECONCILE_INTERVAL_SEC` (default 30; `0` disables), SYSTEMS.
checks each system's stored status against the real Docker state and corrects
it, so a crash or host reboot doesn't leave a stale "running" row. Corrections
are recorded in the audit log as action `reconcile`.

## Backups (V1.1)

- Internal DB: back up the API `data/` directory (SQLite file + WAL).
- Per-system env vars are encrypted with `ENV_SECRET` — **back up `ENV_SECRET`
  separately and securely**, or encrypted env data is unrecoverable.

> V2 adds first-class backups/restores. See [`V2_ROADMAP.md`](V2_ROADMAP.md).

## Retention

- Release retention default is `3` (`RELEASE_RETENTION_DEFAULT`). Automated
  pruning is planned; until then old images accumulate and can be pruned
  manually with care (never prune an image a system or its rollback points to).

---

## Windows operations (production)

Scripts in [`../scripts`](../scripts), all printing `[systems] ...` lines:

| Task | Script |
| --- | --- |
| Prepare host (dirs, network, checks) | `setup-windows.ps1` |
| Build + start SYSTEMS. | `deploy-systems-windows.ps1` |
| Backup (DB + routes + releases) | `backup-systems-windows.ps1` |
| Restore (typed confirmation) | `restore-systems-windows.ps1` |
| Update SYSTEMS. (backup + rollback) | `update-systems-windows.ps1` |
| Health check | `check-systems-health-windows.ps1` |
| Firewall/exposure audit | `check-firewall-windows.ps1` |

## SYSTEMS. self-health
The **Server** screen shows SYSTEMS. watching itself: backend uptime + memory,
disk usage of the data volume (warn ≥75%, alert ≥90%), and backup status (last
backup age / count, "overdue" after 7 days). Anything unmeasurable shows
*not measured yet* — never a fake green.

## Backups
- For a quick consistent DB snapshot, use the in-app backup: **Server → Back up
  now** (or `POST /api/server/backup`). It takes an online SQLite snapshot, copies
  Caddy routes if `CADDY_ROUTES_DIR` is set, and prunes beyond `BACKUP_RETENTION`
  (default 14). A periodic run is available via `BACKUP_INTERVAL_HOURS` when
  `ENABLE_BACKUP_SCHEDULER=true`. See [`BACKUPS.md`](BACKUPS.md).
- For full-volume/offsite backups, schedule `backup-systems-windows.ps1` (Task
  Scheduler) at least daily.
- The script backs up the database (pg_dump or SQLite copy), Caddy routes +
  `Caddyfile`, and releases; optionally logs/uploads (`BACKUP_INCLUDE_*`).
- Script retention: `BACKUP_RETENTION_DAYS` (default 14). Secrets are never
  archived in the manifest or logged.
- **Before destructive actions** (purge, delete-all-releases, DB reset/delete,
  remove routes, major update, restore): the UI/script shows what's removed and
  whether a recent backup exists; purge/DB actions require typing the slug/name.

## Resource limits (per deployed system)
Defaults from `.env` (`DEFAULT_CONTAINER_*`), applied to every container:

| Setting | Env | Default |
| --- | --- | --- |
| Memory | `DEFAULT_CONTAINER_MEMORY_MB` | 512 MB |
| CPU | `DEFAULT_CONTAINER_CPU_LIMIT` | 0.5 cores |
| PIDs | `DEFAULT_CONTAINER_PIDS_LIMIT` | 256 |
| Restart | `DEFAULT_CONTAINER_RESTART_POLICY` | unless-stopped |
| Log size/files | `DEFAULT_CONTAINER_LOG_MAX_SIZE` / `_FILE` | 10m × 3 |
| Disk warn | `DEFAULT_CONTAINER_DISK_WARN_MB` | 1024 MB |

Current defaults are shown on the **Server** screen. Per-system overrides
(CPU/memory/restart/log/disk/internal port/health path) arrive in V1.2.

## Disk & cleanup
Track total disk, `SYSTEMS_DATA_DIR`, releases, uploads, logs, backups, and
Docker usage (`docker system df`). Warn at 75% / 90%, on oversized logs/backups,
accumulating failed uploads, and old images. **Safe** cleanup: temp extraction
folders, old failed uploads, logs by retention, releases by retention, and only
**clearly-scoped, confirmed** old images. Never run a broad automatic
`docker system prune`.
