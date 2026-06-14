# SYSTEMS. — Databases (V2)

> Status: **helpers implemented & unit-tested**; live provisioning **requires
> Windows host validation**. Off by default (`ENABLE_DB_PROVISIONING=false`).

## Architecture (recommended)
**One shared Postgres** with a **per-system database + least-privilege role**
(`DB_MODE=shared`). Simplest to run and back up on a single Windows host.
A container-per-project (`DB_MODE=per-project`) is heavier and only justified
for strong isolation needs.

## Naming & credentials (implemented, pure, tested)
- DB name: `sys_<slug_with_underscores>` · role: `sys_<slug>_app`
- Password: random url-safe (24 bytes); `DATABASE_URL` built and injected as a
  **secret env var**. Secrets are **masked** in the UI and never returned after save.

## Flow (planned execution / host-validated)
create DB + role → grant least privilege → build `DATABASE_URL` → inject as
secret env → redeploy. The parameterized SQL plan is generated in code
(`util/dbprovision.provisionPlan`); **executing it against Postgres is the
host-validated step.**

## Controls (planned UI)
Database section in Ship + System detail; status/disk card; backup/export;
restore; reset; delete/purge **only with explicit typed confirmation**.

## Events
`database_created · database_attached · backup_completed · restore_completed ·
database_reset · database_deleted`.

## Repo tests
`dbName/dbUser` reject unsafe slugs; password randomness/url-safety; URL build +
masking — see `api/test/v2.test.js`.
