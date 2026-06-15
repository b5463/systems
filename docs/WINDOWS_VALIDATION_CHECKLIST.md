# SYSTEMS. — Windows Host Validation Checklist

> Everything below **requires the real Windows machine** — it cannot be
> validated from the repo/CI (no Docker/WSL2/Caddy/Postgres/DNS here). Repo
> logic is unit-tested (`cd api && npm test`); dry-runs are available before any
> mutating step.

## Dry-runs to try first (safe, change nothing)
```powershell
.\scripts\setup-windows.ps1   -DryRun
.\scripts\deploy-systems-windows.ps1 -DryRun
.\scripts\backup-systems-windows.ps1 -DryRun
.\scripts\restore-systems-windows.ps1 -DryRun
.\scripts\update-systems-windows.ps1 -DryRun
.\scripts\check-systems-health-windows.ps1
.\scripts\check-firewall-windows.ps1 -PublicIp <SERVER_IP>
```
In the dashboard, the **Ship** screen shows the planned container name + the
generated Caddy route (dry-run, via `POST /api/deploy/plan`) before you upload.

## Host validation steps
- [ ] Install / start Docker Desktop
- [ ] Confirm WSL2 backend + Linux containers (`docker info --format '{{.OSType}}'` → `linux`)
- [ ] Create Docker network `systems`
- [ ] Start Postgres (container/service), bound to 127.0.0.1; set `POSTGRES_*`
- [ ] Start Caddy (Windows service or container), `CADDY_SYSTEMS_DIR` readable
- [ ] `.\scripts\setup-windows.ps1`
- [ ] `.\scripts\deploy-systems-windows.ps1`
- [ ] Set `REVERSE_PROXY=caddy` in `.env`
- [ ] Set the Postgres connection in `.env`
- [ ] Ship a test Vue/Vite `.zip`
- [ ] Confirm `systems-{slug}` container exists (`docker ps`)
- [ ] Confirm route file exists (`...\caddy\systems.d\{slug}.caddy`)
- [ ] Validate Caddy config (`caddy validate`)
- [ ] Reload Caddy
- [ ] Check `https://systems.acronym.sk` (dashboard)
- [ ] Check `https://{slug}.acronym.sk` (deployed system)
- [ ] Check HTTPS certificate issued
- [ ] Run a health check from the system's detail page
- [ ] Test visibility: public / private (no route) / password (basic auth)
- [ ] Set a system **primary** (Settings → Root domain); confirm `https://acronym.sk`
      serves it and `systems.acronym.sk` still loads the dashboard (needs the root
      `A acronym.sk → SERVER_IP` record)
- [ ] Flag a different system primary; confirm the first one's apex route is dropped
      (only one primary at a time)
- [ ] Stop a container out-of-band (`docker stop systems-{slug}`); confirm the
      dashboard status self-corrects within `RECONCILE_INTERVAL_SEC` (reconciliation)
- [ ] Take an in-app backup (Server → **Back up now**); confirm a timestamped
      folder appears under `BACKUP_DIR`
- [ ] Enable two-factor on an admin, sign out, and sign back in with the code
- [ ] Confirm gated V2 features read **Disabled** on the Server screen unless you
      intentionally enabled them in `.env`
- [ ] Test delete (route gone, history kept)
- [ ] Test purge (typed slug; everything removed)
- [ ] Test backup (`backup-systems-windows.ps1`)
- [ ] Test restore on **non-production** test data (`restore-systems-windows.ps1`)

## Honest status of each
| Capability | Repo status |
| --- | --- |
| Slug rules + reserved names | implemented, **unit-tested** |
| Caddy route generation (public/password/private) | implemented, **unit-tested** |
| Apex/primary route (root domain) | render **unit-tested**; serving **requires host validation** |
| Reconciliation (status vs real Docker state) | implemented, **unit-tested** (logic) |
| In-app online backup + retention | implemented (manual + optional scheduler) |
| Two-factor (TOTP) + session revocation | implemented, **unit-tested** |
| Path-traversal guard | implemented, **unit-tested** |
| Resource-limit mapping | implemented, **unit-tested** |
| Health-state mapping | implemented, **unit-tested** (mocked fetch) |
| Deploy plan (dry-run) | implemented, callable |
| Caddy reload / HTTPS issuance | implemented in code, **requires host validation** |
| Postgres reachable / store cutover | config implemented, **requires host validation** |
| Containers reachable by Caddy (network) | documented, **requires host validation** |
| DNS / firewall / WSL2 | **manual production steps** |
