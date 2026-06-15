# SYSTEMS. — Security

> SYSTEMS. is privileged infrastructure: it controls Docker, the reverse proxy,
> uploaded source, env vars, routes, and logs. It is built to be **hardened,
> private, least-privilege, and admin-only**. It is **not** claimed to be
> unhackable.

## Security posture

The dashboard and API must be inaccessible unless authenticated as an admin.

## Current state (V1.1) vs. planned

| Control | V1.1 today | Planned (V1.2) |
| --- | --- | --- |
| Public signup | **Disabled** (none exists) | unchanged |
| Dashboard access | Admin-only | unchanged |
| API auth | JWT bearer token (7d), verified per route, with **per-user `token_version`** so old tokens can be revoked | HTTP-only, Secure, SameSite cookie sessions |
| Two-factor (admin) | **Opt-in TOTP** (set up on the Admin page) | unchanged |
| Session revocation | Password change, admin reset, and "sign out other sessions" bump `token_version`, invalidating old tokens | unchanged |
| CSRF | N/A (bearer token, not cookies) | **Required** once cookie-based |
| Password hashing | **bcrypt** (cost 12) | bcrypt/Argon2 |
| Plaintext passwords | None stored | unchanged |
| Project access passwords | N/A (no password visibility yet) | hashed, never plaintext |
| Env vars | **AES-256-GCM encrypted at rest**, values never returned by API | unchanged; masked in UI by default |
| Secrets in frontend | None (build-time vars are non-secret only) | unchanged |
| Secrets in logs | Avoided | audited |
| CORS | Locked to `systems.acronym.sk` | unchanged |
| Login rate limiting | **10/min per IP** | tune + lockout |
| API rate limiting | **100/min global**, deploy 5/min | per-route tuning |
| Audit log | All admin actions recorded | + export |
| Destructive actions | Delete requires confirm modal | delete vs **purge** split, strong purge confirm |
| Docker socket | Internal to API container only | unchanged |
| Docker/Caddy admin API | Never public | Caddy admin bound to localhost |
| Postgres | (SQLite, local file) | not publicly exposed |
| Uploaded code | Treated as untrusted; zip-slip prevented; entry/size caps | + build timeouts, resource limits |
| Container hardening | `CapDrop ALL`, `no-new-privileges`, mem/CPU caps, ICC off | unchanged |
| Custom Dockerfile | Detected but advanced use is gated for later | admin-only, explicit opt-in |

## Hard rules

- The **Docker socket** and **Docker API** are never exposed publicly; the
  frontend never talks to Docker directly. Only the API/deploy worker controls
  Docker, internally.
- The **reverse proxy admin/API** is never public.
- The **internal database** is never public.
- **Uploaded code is untrusted.** Extraction is zip-slip-guarded with entry-count
  and per-file size limits; builds will get timeouts and resource limits.
- **Path traversal** is prevented on extraction (resolved paths must stay under
  the destination).

## Planned hardening (tracked for V1.2+)

- Cookie-based sessions (HTTP-only, Secure in prod, SameSite) + CSRF tokens.
- Login lockout/backoff after repeated failures.
- Build timeouts (`BUILD_TIMEOUT_SECONDS`) and per-build resource ceilings.
- Delete vs **purge** separation; purge requires typing the system name.
- Env var masking in the UI with explicit reveal + audit on reveal.

## Reporting & change safety

Schema, Docker, proxy, and server-level changes are treated as dangerous and are
made as dedicated, reviewable steps — never rushed alongside unrelated work.

---

## Windows Firewall posture

**Open publicly (inbound):**
- `80/tcp`, `443/tcp`
- remote admin (RDP/SSH) **only if needed**, restricted to your IP

**Never public:**
- Postgres `5432`
- Docker API / socket (`2375`/`2376`)
- Caddy admin API (`2019`)
- internal backend/API ports, deployment worker ports
- project internal container ports
- Redis/queues (if added later)

Verify with PowerShell / the helper script:
```powershell
Get-NetFirewallRule -Direction Inbound -Enabled True | Get-NetFirewallPortFilter | Sort-Object LocalPort
Get-NetTCPConnection -State Listen | Sort-Object LocalPort
.\scripts\check-firewall-windows.ps1 -PublicIp <SERVER_IP>
```

Checklist:
- [ ] Postgres `5432` not externally reachable
- [ ] Docker API not listening publicly (no `0.0.0.0:2375`)
- [ ] Caddy admin `2019` not public
- [ ] only `80`/`443` open
- [ ] `systems.acronym.sk` behind admin auth
- [ ] private/internal systems have **no** public Caddy route
- [ ] wildcard DNS does not imply every subdomain serves something

## Resource & exposure hardening (V1.1 baseline)
- Every deployed container gets memory/CPU/PIDs limits, a restart policy and
  log rotation from `DEFAULT_CONTAINER_*` (see OPERATIONS). One project cannot
  exhaust the host.
- Destructive **delete** requires typing the system **slug**. V1.2 splits
  delete vs **purge** (purge = stronger confirmation) and adds DB reset/delete
  guarded by typing the database name.
- Pre-destructive-action backup awareness: the UI shows whether a recent backup
  exists and warns when none does.

---

## V2 security review (per feature)

Risky features are **off by default** and only enable via explicit `.env` flags.

| Feature | Key risks | Mitigations | Status | Safe to enable by default? |
| --- | --- | --- | --- | --- |
| 2 GB uploads | OOM, disk exhaustion, zip-slip, abandoned temp files | stream to disk (no buffering), server-side cap, disk-fit check, traversal-safe temp path, admin-only, rate-limit, cleanup on cancel | **implemented, off by default, enable after host validation** | No — keep V1 100 MB until validated |
| DB provisioning | credential leak, privilege escalation, SQL injection | per-system DB + **least-privilege** role, random secret, **masked** + never returned, **parameterized** SQL (no concatenation), allowlisted identifiers, typed-confirm destructive | **implemented, off by default, enable after host validation** | No (`ENABLE_DB_PROVISIONING=false`) |
| Dockerfile builds | arbitrary build instructions | **disabled by default**, explicit opt-in, admin-only, build timeout, resource/PIDs limits, no secrets in logs, audited, rejected silently-never | gate **implemented + tested**; build host-validated | No (`ENABLE_DOCKERFILE_MODE=false`) |
| Node API execution | runs uploaded code | hardened container (CapDrop ALL, no-new-privileges), limits, sanitized names/slugs, no shell concatenation, private mode = no route | classification/plan **implemented + tested**; runtime host-validated | Yes (same trust model as static/Vue) |
| Workers/Bots | long-running uploaded code | no public route by default, limits, logs, restart policy | no-route plan **implemented + tested**; runtime host-validated | Yes |
| Shell console | container code-exec | **disabled by default**, admin-only, audited; honest disabled state (no fake terminal) | gate **implemented + tested**; live use host-validated | No (`ENABLE_SHELL_CONSOLE=false`) |
| GitHub webhooks | forged payloads, token leak, **builds external code** | **HMAC-SHA256 constant-time verify** over raw body, branch filter, admin-only, secret in `.env`, rate-limit | **implemented, off by default, enable after host validation** — riskiest flag (pulls + builds external code) | No (`ENABLE_GITHUB_DEPLOYS=false`) |
| Notifications | secret leak, spam | admin-only config, best-effort POST (won't block deploys), failures logged | **implemented, off by default** (needs `NOTIFY_WEBHOOK_URL`) | Yes once a webhook URL is configured |

**Default posture:** every high-risk V2 feature is disabled until hardened and
host-validated. None are claimed working live.

---

See also: [`HARDENING.md`](HARDENING.md) (verification), [`BACKUPS.md`](BACKUPS.md), [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).
