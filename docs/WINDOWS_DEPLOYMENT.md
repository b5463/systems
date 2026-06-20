<p align="center"><img src="assets/header.svg" alt="SYSTEMS. — deployment engine" width="100%" /></p>

# SYSTEMS. — Windows Deployment (canonical)

Run SYSTEMS. in production on Windows: a machine or VPS with Docker Desktop and
Linux containers via WSL2. Linux is the dev path. Paths default to
`C:\ProgramData\SYSTEMS` and you can change them in `.env`.

The PowerShell scripts referenced here live in [`..\scripts`](../scripts) and
print `[systems] ...` status lines.

---

## 1. Install / verify Docker Desktop
1. Install Docker Desktop for Windows.
2. Enable the WSL2 backend (Settings → General → *Use WSL2 based engine*).
3. Use Linux containers, not Windows containers. Verify:
   ```powershell
   docker info --format '{{.OSType}}'   # must print: linux
   ```

## 2. Windows VPS — nested virtualization
Docker Desktop and WSL2 need hardware virtualization. On a Windows VPS the
provider has to enable nested virtualization (VT-x / AMD-V) for the VM, or WSL2
won't start. If `wsl --status` or Docker Desktop reports the VM can't launch,
that's the cause.

## 3. Caddy: service or container
Caddy is the production proxy and the code is all here. Run it one of two ways:

- **Docker container (recommended for parity):** Caddy runs in the stack and
  mounts `C:\ProgramData\SYSTEMS\caddy`. The API writes per-system route files
  and reloads via the Caddy admin API, bound to localhost only.
- **Windows service:** install Caddy as a service (`caddy.exe`) and point it at
  `CADDY_CONFIG_PATH`. SYSTEMS. writes the route files; reload with
  `caddy reload`.

The main `Caddyfile` imports the per-system files:
```
import C:\ProgramData\SYSTEMS\caddy\systems.d\*.caddy
```
Route files are named `C:\ProgramData\SYSTEMS\caddy\systems.d\{slug}.caddy`.
If Windows Caddy struggles with absolute `import` globs, set the working
directory to `C:\ProgramData\SYSTEMS\caddy` and use `import systems.d\*.caddy`.

## 4. Postgres (optional, preferably containerized)
The SYSTEMS. control-plane database currently remains SQLite. Run Postgres only
when you need opt-in per-system database provisioning
(`ENABLE_DB_PROVISIONING=true` and `POSTGRES_ADMIN_URL`) or want the Server page
to report its reachability. Use a named volume, bind it to `127.0.0.1` only, and
never publish port 5432 publicly. The control-plane Postgres/Prisma cutover is a
separate future migration described in `POSTGRES_PRISMA_MIGRATION.md`.

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
Configure this in Websupport. SYSTEMS. does not automate DNS:
```
A   acronym.sk     → SERVER_IP
A   *.acronym.sk   → SERVER_IP
```
The wildcard covers `systems.acronym.sk` (dashboard) and every `{slug}.acronym.sk`.
The root `acronym.sk` record is what lets you serve a chosen primary system at
the bare domain (step 10); keep it even if you don't set a primary yet.

## 8. Windows Firewall
Open only what must be public; keep everything else private. See
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
3. Admin → Administrators → add the second admin, and enable two-factor on each
   admin while you're there.
4. Ship a small Vue/Vite or static `.zip` and confirm it goes live at
   `slug.acronym.sk`.
5. (Optional) Make one system primary (System detail → Settings → Root domain)
   so it serves at `acronym.sk`; the dashboard stays on `systems.acronym.sk`.
6. Take a first backup: Server → Back up now (and consider enabling the
   scheduler, `ENABLE_BACKUP_SCHEDULER`).
7. Check Docker logs, the Caddy reload, and Postgres.
8. Run `scripts\check-systems-health-windows.ps1`.

---

## <a id="firewall"></a>Windows Firewall

Open publicly (inbound):
- `80/tcp`
- `443/tcp`
- remote admin (RDP/SSH) only if needed, restricted to your IP

Never expose publicly:
- Postgres `5432`
- Docker API / socket (`2375/2376`)
- Caddy admin API (`2019`)
- internal backend/API ports
- deployment worker ports
- project internal container ports
- Redis/queues (if added later)

Inspect rules and listeners with PowerShell:
```powershell
Get-NetFirewallRule -Direction Inbound -Enabled True |
  Get-NetFirewallPortFilter | Sort-Object LocalPort
Get-NetTCPConnection -State Listen | Sort-Object LocalPort
.\scripts\check-firewall-windows.ps1 -PublicIp <SERVER_IP>
```

Rules of the road:
- `systems.acronym.sk` is admin-only (behind auth).
- Deployed projects are public only when visibility = Public.
- Password-protected projects use Caddy basic auth or equivalent.
- Private/internal projects get no public Caddy route.
- Wildcard DNS does not mean every subdomain should expose a service.

Confirm exposure from another network or with the script:
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
| Wildcard subdomain 404 / no resolution | DNS not propagated / wrong A record | verify Websupport `A *.acronym.sk → SERVER_IP` |
| HTTPS not issued | port 443 blocked / DNS wrong | open 443, fix DNS, check Caddy logs |
| Path permission denied | non-elevated shell | run PowerShell as Administrator |

See also: [`SECURITY.md`](SECURITY.md), [`OPERATIONS.md`](OPERATIONS.md),
[`UPDATE_STRATEGY.md`](UPDATE_STRATEGY.md), [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).

---

## Deploy flow (what the platform does)

`upload → validate zip (zip-slip guarded, ≤ UPLOAD_MAX_MB) → detect type →
build → run hardened container → publish route per visibility → reload Caddy →
mark running → schedule a detached health/HTTPS check`.

- **Slugs** are validated and reserved names are rejected (`www, api, admin,
  dashboard, server, system(s), auth, login, proxy, docker, caddy, …`).
- **Visibility:** `public` (route published), `private` (no public route — runs
  and is monitored only), `password` (Caddy `basic_auth`, bcrypt-hashed; set
  from the system's Settings).
- **Routes** are written to `CADDY_SYSTEMS_DIR\{slug}.caddy` and Caddy is
  reloaded. Reload and validate are guarded: a missing Caddy logs a warning
  instead of crashing the API, and the system is not marked live falsely.
- **Delete vs Purge:** delete stops the container and removes the route but keeps
  history; purge removes the container, images, route, release files and all
  records, and requires typing the slug.
- **Health check** runs automatically after deploy/redeploy and can also be
  triggered from System detail. It stores status and response time; results are
  honest (`healthy / unhealthy / timeout / unreachable`). Published routes are
  checked over their real public HTTP(S) URL. Systems without a route fall back
  to their loopback host port. The current check path is `/`.
- **Release retention** trims deploy history beyond `RELEASE_RETENTION_DEFAULT`.

### Caddy container networking
For Caddy to reach app containers by name, deployed containers must be named
`systems-{slug}` and share a Docker network with Caddy that permits
inter-container traffic. The generated route uses
`reverse_proxy systems-{slug}:3000`. Set `REVERSE_PROXY=caddy` and run Caddy
(container or service) with `CADDY_SYSTEMS_DIR` mounted and readable. This is the
one part that needs the real host to confirm; it can't be exercised in a
Docker-less CI/dev box.

### Postgres
The internal store runs on SQLite today. `POSTGRES_HOST` enables a reachability
probe on the Server screen, while `POSTGRES_ADMIN_URL` is used only by optional
per-system database provisioning. The PowerShell backup script can dump a
configured Postgres service, but there is no implemented control-plane migration
runner or Postgres-backed platform store yet.
