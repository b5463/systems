# SYSTEMS. — Hardening Verification

What's actually checked in the code, versus what you still need to verify on the
real Windows machine.

## Run the checks
```bash
# repo logic (30 tests): slug/reserved, caddy routes, zip-slip, limits,
# health mapping, proxy, optional-feature flags/classify/db/upload/webhook
cd api && npm test
```
```powershell
# Windows host (read-only audits)
.\scripts\verify-hardening-windows.ps1 -PublicIp <SERVER_IP>
.\scripts\check-firewall-windows.ps1   -PublicIp <SERVER_IP>
.\scripts\check-systems-health-windows.ps1
```

## Verified in repo (logic-tested / observed)
| Control | Evidence |
| --- | --- |
| Risky optional features OFF by default | `flags` test + `features({})` all false |
| Dockerfile builds never run silently | deploy gate (`ENABLE_DOCKERFILE_MODE`) |
| Shell console refused unless enabled | exec gate (`ENABLE_SHELL_CONSOLE`) |
| Slug validation + reserved names | `slug` tests |
| Zip-slip / path traversal rejected | `pathsafe` tests + used in extraction |
| Caddy: private = no route; password = hashed basic_auth | `caddy` tests |
| Container resource limits (mem/cpu/pids/restart/log) | `limits` tests |
| Health states are honest (no fake green) | `health` tests |
| Webhook HMAC constant-time verify | webhook test |
| Cookie auth / CSRF / origin rejection / session rotation | route integration tests |
| Login backoff + persistent operator IP denylist | lockout unit tests + admin route integration test |
| Env vars encrypted at rest; values never returned | code review (`routes/env.js`) |
| Secrets never returned (basic-auth hash stripped) | code review (`routes/projects.js`) |
| No tracked `.env`; `.env` gitignored | repo check |
| Compose publishes only 80/443; DB/Docker-API not published | `docker-compose.yml` |

## Safe-by-default config
`ENABLE_DOCKERFILE_MODE/SHELL_CONSOLE/DB_PROVISIONING/GITHUB_DEPLOYS/NOTIFICATIONS=false`,
`DB_MODE=shared`, `UPLOAD_MAX_MB=100`. CORS locked to the dashboard origin.

## Requires Windows host validation
- Docker socket / Docker API not reachable on the network
- Postgres `5432`, Caddy admin `2019` not public; only `80`/`443` open (firewall)
- Caddy reload/validate, HTTPS issuance, wildcard DNS resolution
- Production TLS and the `Secure` cookie flag on the deployed origin (cookie/CSRF logic is repository-tested)

## Manual production steps
`verify-hardening-windows.ps1` flags placeholder secrets, default admin
password, wildcard CORS, enabled risky flags, public sensitive ports, and stale
backups. Resolve all HIGH findings before exposing the host.

## Backup coverage vs disaster recovery
`backup-systems-windows.ps1` captures: **database** (pg_dump or SQLite copy),
**Caddy routes + Caddyfile**, **releases**, optional logs/uploads — matching the
critical state in [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md). **`.env` is
deliberately NOT in the archive** (it holds secrets) — back it up **separately
and securely**; `ENV_SECRET` loss makes encrypted env vars unrecoverable.
