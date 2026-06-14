# SYSTEMS. — Resource Limits

> The limits are written and tested, and applied to every container. Docker is
> what actually enforces them, so confirm it once on a real server.

## Defaults (`.env`, applied to every system)
| Setting | Env | Default | Docker field |
| --- | --- | --- | --- |
| Memory | `DEFAULT_CONTAINER_MEMORY_MB` | 512 | `Memory` |
| CPU | `DEFAULT_CONTAINER_CPU_LIMIT` | 0.5 | `CpuQuota`/`CpuPeriod` |
| PIDs | `DEFAULT_CONTAINER_PIDS_LIMIT` | 256 | `PidsLimit` |
| Restart | `DEFAULT_CONTAINER_RESTART_POLICY` | unless-stopped | `RestartPolicy` |
| Log size/files | `DEFAULT_CONTAINER_LOG_MAX_SIZE` / `_FILE` | 10m × 3 | `LogConfig` |
| Disk warn | `DEFAULT_CONTAINER_DISK_WARN_MB` | 1024 | (UI warning) |

Containers also run hardened: `CapDrop ALL`, `no-new-privileges`, isolated
network. So one project cannot exhaust the Windows host.

## Where shown
The **Server** screen shows the active defaults. Per-system overrides
(CPU/memory/restart/log/disk/internal port/health path) are **planned for a
follow-up** — the mapping accepts overrides today (`util/limits.js`) but the
per-system UI/store is not wired.

## Verify
`cd api && npm test` (limits: defaults, env values, per-system override).
