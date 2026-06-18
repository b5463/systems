# 0002 — SQLite by default, Postgres as an option

**Status:** Accepted

## Context

The platform needs a small amount of durable state (admins, systems,
deployments, audit, metrics). Single-host deployments want zero database
operations; some operators will still prefer Postgres.

## Decision

Ship **SQLite** (via `better-sqlite3`, WAL mode) as the default internal store —
a single file under the data dir, no service to run. Support **Postgres** as a
drop-in alternative by pointing the app at a connection string. The deploy
*workloads'* optional per-app databases are a separate concern (Postgres
provisioning, gated — see [0005](0005-risky-features-off-by-default.md)).

## Consequences

- Zero-setup default; backups are a file snapshot (WAL-safe online backup API).
- Synchronous `better-sqlite3` calls simplify transactional code (e.g. the audit
  hash chain in [0007](0007-tamper-evident-audit-log.md)) but mean writes block
  the event loop briefly — fine at this scale, single host.
- The SQLite→Postgres cutover is built as its own reviewable path and is pending
  host validation, rather than maintained as two always-live backends.
