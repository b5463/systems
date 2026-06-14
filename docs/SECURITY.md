# SYSTEMS. — Security

> SYSTEMS. is privileged infrastructure: it controls Docker, the reverse proxy,
> uploaded source, env vars, routes, and logs. It is built to be **hardened,
> private, least-privilege, and admin-only**. It is **not** claimed to be
> unhackable.

## Posture: secure-by-default

The dashboard and API must be inaccessible unless authenticated as an admin.

## Current state (V1.1) vs. planned

| Control | V1.1 today | Planned (V1.2) |
| --- | --- | --- |
| Public signup | **Disabled** (none exists) | unchanged |
| Dashboard access | Admin-only | unchanged |
| API auth | JWT bearer token (7d), verified per route | HTTP-only, Secure, SameSite cookie sessions |
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
