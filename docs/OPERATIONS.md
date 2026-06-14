# SYSTEMS. — Operations (day 2)

> Status: V1.1 skeleton. Operational runbook for the running platform.

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

## Backups (V1.1)

- Internal DB: back up the API `data/` directory (SQLite file + WAL).
- Per-system env vars are encrypted with `ENV_SECRET` — **back up `ENV_SECRET`
  separately and securely**, or encrypted env data is unrecoverable.

> V2 adds first-class backups/restores. See [`V2_ROADMAP.md`](V2_ROADMAP.md).

## Retention

- Release retention default is `3` (`RELEASE_RETENTION_DEFAULT`). Automated
  pruning is planned; until then old images accumulate and can be pruned
  manually with care (never prune an image a system or its rollback points to).
