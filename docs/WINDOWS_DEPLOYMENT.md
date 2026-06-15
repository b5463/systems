<p align="center"><img src="assets/header.svg" alt="SYSTEMS. — deployment engine" width="100%" /></p>

# SYSTEMS. — Windows Deployment (canonical)

> **Production target: Windows.** A Windows machine or Windows VPS running
> Docker Desktop (Linux containers via WSL2). Linux is dev/secondary only.
> All paths default to `C:\ProgramData\SYSTEMS` and are configurable in `.env`.

PowerShell scripts referenced here live in [`..\scripts`](../scripts) and print
`[systems] ...` status lines.

---

## 1. Install / verify Docker Desktop
1. Install Docker Desktop for Windows.
2. **Enable the WSL2 backend** (Settings → General → *Use WSL2 based engine*).
3. **Use Linux containers** (not Windows containers). Verify:
   ```powershell
   docker info --format '{{.OSType}}'   # must print: linux
   ```

## 2. Windows VPS — nested virtualization
Docker Desktop + WSL2 require hardware virtualization. On a **Windows VPS** the
provider must enable **nested virtualization / VT-x / AMD-V** for the VM, or
WSL2 will not start. If `wsl --status` or Docker Desktop reports the VM cannot
launch, ask the provider to enable nested virtualization.

## 3. Caddy — service or container
Either is supported (Caddy lands fully in V1.2; pick one now):
- **Docker container (recommended for parity):** Caddy runs in the stack,
  mounts `C:\ProgramData\SYSTEMS\caddy`. The API writes per-system route files
  and reloads via the Caddy admin API bound to **localhost only**.
- **Windows service:** install Caddy as a service (`caddy.exe`), point it at
  `CADDY_CONFIG_PATH`. SYSTEMS. writes route files; reload with
  `caddy reload`.

Main `Caddyfile` imports per-system files:
```
import C:\ProgramData\SYSTEMS\caddy\systems.d\*.caddy
```
Route files are named `C:\ProgramData\SYSTEMS\caddy\systems.d\{slug}.caddy`.
If Windows Caddy struggles with absolute `import` globs, set the working
directory to `C:\ProgramData\SYSTEMS\caddy` and use `import systems.d\*.caddy`.

## 4. Postgres (preferably containerized)
Run Postgres as a Docker container in the stack, data on a named volume.
Bind it to **127.0.0.1 only** — never publish 5432 publicly. Configure
`POSTGRES_*` in `.env`. (V1.1 runs on SQLite; V1.2 cuts over to Postgres.)

## 5. Create the data layout
`scripts\setup-windows.ps1` creates these (idempotent):
```
C:\ProgramData\SYSTEMS
C:\ProgramData\SYSTEMS\releases
C:\ProgramData\SYSTEMS\uploads
C:\ProgramData\SYSTEMS\logs
C:\ProgramData\SYSTEMS\backups
C:\ProgramData\SYSTEMS\caddy\systems.d
```

## 6. Docker network
`setup-windows.ps1` creates the `systems` network (from `DOCKER_NETWORK`).

## 7. Websupport DNS (manual, wildcard)
Configure in Websupport (SYSTEMS. does **not** automate DNS):
```
A   acronym.sk     → SERVER_IP
A   *.acronym.sk   → SERVER_IP
```
The wildcard covers `systems.acronym.sk` (dashboard) and every `{slug}.acronym.sk`.
The root `acronym.sk` record is what lets you serve a chosen **primary** system
at the bare domain (step 10); keep it even if you don't set a primary yet.

## 8. Windows Firewall
Open **only** what must be public; keep everything else private. See
[§ Firewall](#firewall) below and `scripts\check-firewall-windows.ps1`.

## 9. Run setup + deploy
```powershell
Copy-Item .env.example .env      # then edit secrets/paths
.\scripts\setup-windows.ps1
.\scripts\deploy-systems-windows.ps1
```

## 10. Verify & bootstrap admins
1. Open `https://systems.acronym.sk` → SYSTEMS. login.
2. Sign in with the first admin (`ADMIN_USERS`, later `ADMIN_EMAIL`).
3. **Admin → Administrators →** add the **second admin**; enable **two-factor**
   on each admin while you're there.
4. **Ship** a small Vue/Vite or static `.zip`; confirm it goes live at
   `slug.acronym.sk`.
5. (Optional) Make one system **primary** (System detail → Settings → Root
   domain) so it serves at `acronym.sk`; the dashboard stays on
   `systems.acronym.sk`.
6. Take a first backup: **Server → Back up now** (and consider enabling the
   scheduler, `ENABLE_BACKUP_SCHEDULER`).
7. Check Docker logs, Caddy reload, and (V1.2) Postgres.
8. `scripts\check-systems-health-windows.ps1`.

---

## <a id="firewall"></a>Windows Firewall

**Open publicly (inbound):**
- `80/tcp`
- `443/tcp`
- remote admin (RDP/SSH) **only if needed, restricted to your IP**

**Never expose publicly:**
- Postgres `5432`
- Docker API / socket (`2375/2376`)
- Caddy admin API (`2019`)
- internal backend/API ports
- deployment worker ports
- project internal container ports
- Redis/queues (if added later)

Inspect rules / listeners with PowerShell:
```powershell
Get-NetFirewallRule -Direction Inbound -Enabled True |
  Get-NetFirewallPortFilter | Sort-Object LocalPort
Get-NetTCPConnection -State Listen | Sort-Object LocalPort
.\scripts\check-firewall-windows.ps1 -PublicIp <SERVER_IP>
```

Rules of the road:
- `systems.acronym.sk` is **admin-only** (behind auth).
- Deployed projects are public **only** when visibility = Public.
- Password-protected projects use Caddy basic auth/equivalent.
- Private/internal projects get **no** public Caddy route.
- Wildcard DNS does **not** mean every subdomain should expose a service.

Confirm exposure (run from another network or use the script):
- Postgres `5432` not reachable from outside
- Docker API not listening publicly
- Caddy admin `2019` not public
- only `80`/`443` open

---

## Troubleshooting (Windows-specific)

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `docker` errors / OSType not linux | Docker Desktop not running / Windows containers | Start Docker Desktop; switch to Linux containers |
| WSL2 won't start | nested virt disabled (VPS) / WSL not installed | `wsl --install`; ask provider to enable nested virtualization |
| Port 80/443 in use | IIS / Skype / another web server | Stop the conflicting service or change its port |
| No public traffic | Firewall rule missing | Add inbound 80/443; run `check-firewall-windows.ps1` |
| Caddy can't read route files | path/permission/glob issue | Use working dir `...\caddy` + `import systems.d\*.caddy`; check ACLs |
| Volume mount fails | drive not shared with Docker | Docker Desktop → Settings → Resources → File sharing |
| Container can't reach Caddy/Postgres | wrong network | ensure all on the `systems` Docker network |
| Wildcard subdomain 404/无解析 | DNS not propagated / wrong A record | verify Websupport `A *.acronym.sk → SERVER_IP` |
| HTTPS not issued | port 443 blocked / DNS wrong | open 443, fix DNS, check Caddy logs |
| Path permission denied | non-elevated shell | run PowerShell as Administrator |

See also: [`SECURITY.md`](SECURITY.md), [`OPERATIONS.md`](OPERATIONS.md),
[`UPDATE_STRATEGY.md`](UPDATE_STRATEGY.md), [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).

---

## V1.2 deploy flow (what the platform does)

`upload → validate zip (zip-slip guarded, ≤ UPLOAD_MAX_MB) → detect type →
build (Vue/Vite or static) → run hardened container → publish route per
visibility → reload Caddy → (optional) health/HTTPS check → mark live`.

- **Slugs** are validated and **reserved names rejected** (`www, api, admin,
  dashboard, server, system(s), auth, login, proxy, docker, caddy, …`).
- **Visibility:** `public` (route published), `private` (no public route —
  runs and is monitored only), `password` (Caddy `basic_auth`, bcrypt-hashed;
  set from the system's **Settings**).
- **Routes** are written to `CADDY_SYSTEMS_DIR\{slug}.caddy` and Caddy is
  reloaded. Reload/validate are guarded — a missing Caddy logs a warning
  instead of crashing the API, and the system is **not** marked live falsely.
- **Delete vs Purge:** delete stops the container + removes the route but keeps
  history; **purge** removes container, images, route, release files and all
  records and **requires typing the slug**.
- **Health check** runs a real HTTP(S) request and stores status/response time;
  results are honest (`healthy / unhealthy / timeout / unreachable`).
- **Release retention** trims deploy history beyond `RELEASE_RETENTION_DEFAULT`.

### Caddy container networking (required, validate on the host)
For Caddy to reach app containers by name, deployed containers must be named
`systems-{slug}` and share a Docker network with Caddy that permits
inter-container traffic. The generated route uses
`reverse_proxy systems-{slug}:3000`. Set `REVERSE_PROXY=caddy` and run Caddy
(container or service) with `CADDY_SYSTEMS_DIR` mounted/readable. This is the
one part that must be validated on the Windows host (it cannot be exercised in
a Docker-less CI/dev box).

### Postgres (V1.2)
The internal DB target is Postgres. The current build runs on SQLite; the
`POSTGRES_*` settings + a `pg_dump`-based backup are in place, and the Server
screen reports Postgres **Connected** only when `POSTGRES_HOST` is actually
reachable. Cutting the internal store over to Postgres is a dedicated, tested
migration step on the host — do it with a backup taken first.
