# 0001 — Admin-only, two-admin cap, no public signup

**Status:** Accepted

## Context

SYSTEMS. is privileged: it controls Docker, the reverse proxy, uploaded code,
env vars, and routes. It is meant to be one person's (or a small team's) control
panel for their own server — not a multi-tenant service with sign-ups.

## Decision

No public registration. Access is admin-only, capped at **two** admins: the
first is seeded from `ADMIN_USERS` in `.env`, the second is added on the Admin
screen. Every dashboard, API, and deploy action requires an authenticated admin.
There is intentionally **no role/permission hierarchy** — both admins are equal.

## Consequences

- Drastically smaller attack surface and auth model; no tenant isolation, RBAC,
  invitation flows, or quota logic to build or audit.
- A second admin exists specifically so a lost password is recoverable
  (see [`DISASTER_RECOVERY.md`](../DISASTER_RECOVERY.md) §18).
- Not suitable as-is for offering deployments to third parties — that would need
  a real multi-tenant redesign.
