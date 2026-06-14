# SYSTEMS. — Server Deployment Guide

> **Production target is Windows.** The canonical, step-by-step guide is
> **[`WINDOWS_DEPLOYMENT.md`](WINDOWS_DEPLOYMENT.md)** — start there.
>
> This page summarizes the deployment surface and the Linux dev path.

## Windows (production) — see the canonical guide
[`WINDOWS_DEPLOYMENT.md`](WINDOWS_DEPLOYMENT.md) covers, in order:
Docker Desktop + WSL2 + Linux containers · nested virtualization (VPS) ·
Caddy (service or container) · Postgres (containerized) ·
`C:\ProgramData\SYSTEMS` layout · Docker network · Websupport wildcard DNS ·
Windows Firewall · `setup-windows.ps1` → `deploy-systems-windows.ps1` ·
verification · first/second admin · first test deploy · troubleshooting.

PowerShell scripts (in [`../scripts`](../scripts)):
| Script | Purpose |
| --- | --- |
| `setup-windows.ps1` | verify prereqs, create dirs + network |
| `deploy-systems-windows.ps1` | build dashboard, bring up the stack |
| `backup-systems-windows.ps1` | DB + routes + releases backup, retention |
| `restore-systems-windows.ps1` | guided restore (typed confirmation) |
| `update-systems-windows.ps1` | safe update with pre-backup + rollback |
| `check-systems-health-windows.ps1` | read-only health check |
| `check-firewall-windows.ps1` | verify exposed/blocked ports |

## Configuration
Copy `.env.example` → `.env`. It is **Windows-first** (paths under
`C:\ProgramData\SYSTEMS`, Caddy/Postgres, container resource defaults, backup
settings). Required V1.1 secrets: `JWT_SECRET`, `ENV_SECRET`, `ADMIN_USERS`,
`CORS_ORIGIN`.

## Linux (development/secondary)
For local dev only:
```bash
cp .env.example .env   # override Windows paths with POSIX paths
cd api && npm install && npm run dev
cd dashboard && npm install && npm run dev
```
`docker-compose.yml` brings up the current (nginx + API) stack. The Caddy +
Postgres production stack is finalized in V1.2.

## Security gate before exposing
- `JWT_SECRET` / `ENV_SECRET` strong and unique; default admin password changed.
- Only `80`/`443` public. Postgres, Docker API, Caddy admin **not** public.
- CORS locked to `systems.acronym.sk`.
- Run `check-firewall-windows.ps1 -PublicIp <SERVER_IP>`.

See [`SECURITY.md`](SECURITY.md), [`OPERATIONS.md`](OPERATIONS.md),
[`UPDATE_STRATEGY.md`](UPDATE_STRATEGY.md), [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).
