# 0007 — Tamper-evident, hash-chained audit log

**Status:** Accepted

## Context

The audit log records every admin and deploy action. As a plain table, anyone
with database write access could quietly edit or delete history, so the log
could not be trusted as evidence after an incident.

## Decision

Chain the audit log with hashes. Each row stores `prev_hash` (the previous row's
hash) and `hash = SHA-256(prev_hash + canonical(row immutable fields))`, written
atomically with the insert (`util/audit.js`, wired in `db/index.js`). A
`GET /api/audit/verify` endpoint walks the chain and reports the first row that
was modified, removed, or reordered. Retention pruning (`AUDIT_RETENTION_DAYS`)
deletes the oldest rows; verification simply anchors at the first retained row.

## Consequences

- Silent edits/deletions/reordering of history become **detectable**.
- It is evidence *of* tampering, not prevention: someone with write access can
  recompute the whole chain. Real integrity guarantees need an external anchor
  (e.g. periodically exporting the latest hash off-box) — noted as future work.
- Rows written before this change keep NULL hashes; verification starts at the
  first hashed row, so the migration is seamless.
