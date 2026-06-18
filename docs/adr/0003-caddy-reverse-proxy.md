# 0003 — Caddy in production, nginx in dev

**Status:** Accepted

## Context

Each deployed system needs its own subdomain with TLS, and the dashboard lives
on `systems.<base>`. Certificates must be issued and renewed without manual
steps. Local development shouldn't require TLS or cert issuance at all.

## Decision

Use **Caddy** as the production reverse proxy: a main `Caddyfile` imports
per-system route files the API generates into a `systems.d/` directory; the API
reloads Caddy through its localhost-bound admin API. Caddy handles **automatic
HTTPS** (ACME issuance + renewal) per host. **nginx** is the dev default (no
TLS), selected with `REVERSE_PROXY`.

## Consequences

- Certificate rotation is delegated to Caddy — one less thing to operate.
- The API only writes/validates route files and triggers reloads; it never holds
  TLS material. Config is validated before reload so a bad route can't take the
  proxy down (see [`DISASTER_RECOVERY.md`](../DISASTER_RECOVERY.md) §3).
- Two proxy backends to keep wired; the Caddy path is pending host validation.
