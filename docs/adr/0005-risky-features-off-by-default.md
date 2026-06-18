# 0005 — Risky features built but off behind `.env` flags

**Status:** Accepted

## Context

Several wanted features meaningfully expand the attack surface: custom
Dockerfiles, an interactive container shell, GitHub deploy-on-push, per-app
Postgres provisioning, large chunked uploads, outbound notifications. Some pull
or execute external code.

## Decision

Build them fully — endpoints, UI, and tests — but keep each **disabled by
default** behind its own `ENABLE_*` flag. They turn on only by deliberate
operator choice after reading the matching `docs/*.md` and validating on the
host. Disabled endpoints return an honest "disabled" response (no fake UI).

## Consequences

- Default install is minimal-surface; the riskiest capabilities (e.g. GitHub
  webhooks that build external code) require explicit opt-in plus a secret.
- Feature gates are themselves implemented and tested, so "off" is enforced
  server-side, not just hidden in the UI.
- More configuration surface to document — handled per-feature in `docs/`.
