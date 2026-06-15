# SYSTEMS. — Security

SYSTEMS. is privileged infrastructure. It controls Docker, the reverse proxy,
uploaded source, env vars, routes, and logs. It's built to be hardened, private,
least-privilege, and admin-only. It is not claimed to be unhackable.

The dashboard and API must be unreachable unless you're authenticated as an admin.

## Controls in place

The "not yet" column is the genuinely unbuilt work, not a release timeline.

| Control | In place | Not yet |
| --- | --- | --- |
| Public signup | **Disabled** (none exists) | — |
| Dashboard access | Admin-only | — |
| API auth | JWT bearer token (7d), verified per route, with **per-user `token_version`** so old tokens can be revoked | HTTP-only, Secure, SameSite cookie sessions |
| Two-factor (admin) | **Opt-in TOTP**, set up on the Admin page | — |
| Session revocation | Password change, admin reset, and "sign out other sessions" bump `token_version`, invalidating old tokens | — |
| CSRF | N/A (bearer token, not cookies) | required once auth moves to cookies |
| Password hashing | **bcrypt** (cost 12) | — |
| Plaintext passwords | None stored | — |
| Env vars | **AES-256-GCM encrypted at rest**, values never returned by API | — |
| Secrets in frontend | None (build-time vars are non-secret only) | — |
| Secrets in logs | Avoided | — |
| CORS | Locked to `systems.acronym.sk` | — |
| Login rate limiting | **10/min per IP** | lockout/backoff |
| API rate limiting | **100/min global**, deploy 5/min | per-route tuning |
| Audit log | All admin actions recorded | export |
| Destructive actions | **Delete** keeps history; **purge** needs the typed slug | — |
| Docker socket | Internal to API container only | — |
| Docker/Caddy admin API | Never public; Caddy admin bound to localhost | — |
| Postgres | Wired; not publicly exposed (SQLite is the local dev file) | — |
| Uploaded code | Treated as untrusted; zip-slip prevented; entry/size caps | build timeouts, build resource ceilings |
| Container hardening | `CapDrop ALL`, `no-new-privileges`, mem/CPU caps, ICC off | — |
| Custom Dockerfile | Built, admin-only, off behind `ENABLE_DOCKERFILE_MODE` | — |

## Hard rules

- The **Docker socket** and **Docker API** are never exposed publicly; the
  frontend never talks to Docker directly. Only the API/deploy worker controls
  Docker, internally.
- The **reverse proxy admin/API** is never public.
- The **internal database** is never public.
- **Uploaded code is untrusted.** Extraction is zip-slip-guarded with entry-count
  and per-file size limits.
- **Path traversal** is prevented on extraction (resolved paths must stay under
  the destination).

## Not yet built

- Cookie-based sessions (HTTP-only, Secure in prod, SameSite) + CSRF tokens, to
  replace the localStorage bearer token.
- Login lockout/backoff after repeated failures.
- Build timeouts (`BUILD_TIMEOUT_SECONDS`) and per-build resource ceilings.
- Env var masking in the UI with explicit reveal + audit on reveal.

## Change safety

Schema, Docker, proxy, and server-level changes are dangerous, so they go in as
dedicated, reviewable steps rather than alongside unrelated work.

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

## Resource & exposure hardening
- Every deployed container gets memory/CPU/PIDs limits, a restart policy, and
  log rotation from `DEFAULT_CONTAINER_*` (see OPERATIONS). One project can't
  exhaust the host.
- Destructive actions are split: **delete** stops the container and pulls the
  public route but keeps history, while **purge** removes everything and requires
  typing the system **slug** to confirm.
- Before a destructive action, the UI shows whether a recent backup exists and
  warns when none does.

---

## Optional features — security review (per feature)

These features are built and off by default. Each one enables only through its
explicit `.env` flag.

| Feature | Key risks | Mitigations | Status | Safe to enable by default? |
| --- | --- | --- | --- | --- |
| 2 GB uploads | OOM, disk exhaustion, zip-slip, abandoned temp files | stream to disk (no buffering), server-side cap, disk-fit check, traversal-safe temp path, admin-only, rate-limit, cleanup on cancel | **built, off by default, enable after host validation** | No — keep the 100 MB cap until validated |
| DB provisioning | credential leak, privilege escalation, SQL injection | per-system DB + **least-privilege** role, random secret, **masked** + never returned, **parameterized** SQL (no concatenation), allowlisted identifiers, typed-confirm destructive | **built, off by default, enable after host validation** | No (`ENABLE_DB_PROVISIONING=false`) |
| Dockerfile builds | arbitrary build instructions | **disabled by default**, explicit opt-in, admin-only, build timeout, resource/PIDs limits, no secrets in logs, audited, rejected silently-never | gate **implemented + tested**; build host-validated | No (`ENABLE_DOCKERFILE_MODE=false`) |
| Node API execution | runs uploaded code | hardened container (CapDrop ALL, no-new-privileges), limits, sanitized names/slugs, no shell concatenation, private mode = no route | classification/plan **implemented + tested**; runtime host-validated | Yes (same trust model as static/Vue) |
| Workers/Bots | long-running uploaded code | no public route by default, limits, logs, restart policy | no-route plan **implemented + tested**; runtime host-validated | Yes |
| Shell console | container code-exec | **disabled by default**, admin-only, audited; honest disabled state (no fake terminal) | gate **implemented + tested**; live use host-validated | No (`ENABLE_SHELL_CONSOLE=false`) |
| GitHub webhooks | forged payloads, token leak, **builds external code** | **HMAC-SHA256 constant-time verify** over raw body, branch filter, admin-only, secret in `.env`, rate-limit | **built, off by default, enable after host validation** — riskiest flag (pulls + builds external code) | No (`ENABLE_GITHUB_DEPLOYS=false`) |
| Notifications | secret leak, spam | admin-only config, best-effort POST (won't block deploys), failures logged | **built, off by default** (needs `NOTIFY_WEBHOOK_URL`) | Yes once a webhook URL is configured |

**Default posture:** every high-risk feature ships disabled and stays that way
until it's been validated on the real host. None are claimed working live.

---

See also: [`HARDENING.md`](HARDENING.md) (verification), [`BACKUPS.md`](BACKUPS.md), [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).
