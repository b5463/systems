# SYSTEMS. — Server Deployment Guide

Production runs on Windows. The full step-by-step guide is
[`WINDOWS_DEPLOYMENT.md`](WINDOWS_DEPLOYMENT.md); start there. This page is a
quick map of the deployment surface plus the Linux dev path.

## Windows (production): see the canonical guide
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
Copy `.env.example` → `.env`. It's Windows-first: paths under
`C:\ProgramData\SYSTEMS`, Caddy and Postgres settings, container resource
defaults, backup settings. The secrets you must set: `JWT_SECRET`, `ENV_SECRET`,
`ADMIN_USERS`, `CORS_ORIGIN`.

## Linux (development/secondary)
For local dev only:
```bash
cp .env.example .env   # override Windows paths with POSIX paths
cd api && npm install && npm run dev
cd dashboard && npm install && npm run dev
```
`docker-compose.yml` brings up the dev stack (nginx + API). nginx is the dev
proxy. Caddy is the production proxy and is already wired; you switch to it with
`REVERSE_PROXY=caddy` on the host.

## Security gate before exposing
- `JWT_SECRET` / `ENV_SECRET` strong and unique; default admin password changed;
  two-factor enabled on each admin.
- Only `80`/`443` public. Postgres, Docker API, and Caddy admin not public.
- CORS locked to systems.acronym.sk.
- Keep TRUST_PROXY=false for direct API exposure. Set it to 	rue only when Caddy/nginx is the sole path to the API, then verify the audit/session IPs show the real client rather than the proxy.
- Run `check-firewall-windows.ps1 -PublicIp <SERVER_IP>`.
- Take a first backup (Server → Back up now); confirm restore on test data.

See [`SECURITY.md`](SECURITY.md), [`OPERATIONS.md`](OPERATIONS.md),
[`UPDATE_STRATEGY.md`](UPDATE_STRATEGY.md), [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).
