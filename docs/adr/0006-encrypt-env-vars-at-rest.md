# 0006 — Encrypt per-system env vars at rest (AES-256-GCM)

**Status:** Accepted

## Context

Deployed systems carry environment variables that routinely include secrets
(API keys, DB URLs). They must persist in the internal database, but a database
file or backup leaking should not hand over every system's secrets in plaintext.

## Decision

Encrypt each system's env vars with **AES-256-GCM** before storing them, using a
key from `ENV_SECRET`. Values are decrypted only when needed to run a container
and are **never returned** by the API to the frontend. DB connection strings are
masked in responses and logs.

## Consequences

- A leaked DB/backup file does not expose secrets without `ENV_SECRET`, which
  lives only in `.env` and is excluded from backups.
- `ENV_SECRET` is now critical key material: losing it makes stored env vars
  unrecoverable; rotating it requires re-encrypting existing rows.
- The UI cannot show current secret values (by design); a masked reveal-with-
  audit flow is noted as not-yet-built in [`SECURITY.md`](../SECURITY.md).
