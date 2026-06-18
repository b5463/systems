# 0004 — Honest status via reconciliation against Docker

**Status:** Accepted

## Context

A dashboard that shows a stale "running" badge after a crash or reboot is worse
than useless — it erodes trust in everything else it reports. Stored status and
real container state drift whenever something happens out of band.

## Decision

Treat Docker as the source of truth. A reconciliation job
(`services/reconcile.js`) runs on boot and every `RECONCILE_INTERVAL_SEC`
(default 30s), compares each system's stored status to the real container state,
and corrects drift. The UI distinguishes a **failed build** from a **crashed
container**, and never claims Caddy/Postgres are live when they aren't. The pure
decision logic is unit-tested.

## Consequences

- Badges self-correct after crashes/reboots without manual intervention.
- A deliberate bias against caching status: we recompute rather than risk showing
  something stale (see also why there's no server-side response cache).
- A little extra Docker API traffic on each interval — negligible on one host.
