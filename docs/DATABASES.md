# SYSTEMS. — Databases (V2)

> There is now a runner that provisions a per-system Postgres database. Off by
> default — requires `ENABLE_DB_PROVISIONING=true`, the optional `pg` npm
> package installed on the host, and `POSTGRES_ADMIN_URL` (an admin/superuser
> connection string).

## Architecture (recommended)
**One shared Postgres** with a **per-system database + least-privilege role**
(`DB_MODE=shared`). Simplest to run and back up on a single Windows host.
A container-per-project (`DB_MODE=per-project`) is heavier and only justified
for strong isolation needs.

## How it works
`POST /api/projects/:slug/provision-db`:

- creates a per-system Postgres database and a least-privilege role,
- builds the resulting `DATABASE_URL` and stores it into the system's
  **encrypted** env (picked up on the **next deploy**).

Identifiers are validated/allowlisted before use; the SQL is parameterized, not
concatenated.

- DB name: `sys_<slug_with_underscores>` · role: `sys_<slug>_app`
- Password: random url-safe (24 bytes); `DATABASE_URL` is stored as an encrypted
  env var, **masked** in the UI and never returned after save.

## Controls (planned UI)
Database section in Ship + System detail; status/disk card; backup/export;
restore; reset; delete/purge **only with explicit typed confirmation**.

## Events
`database_created · database_attached · backup_completed · restore_completed ·
database_reset · database_deleted`.

## Repo tests
`dbName/dbUser` reject unsafe slugs; password randomness/url-safety; URL build +
masking — see `api/test/v2.test.js`.

Code: `api/src/services/dbprovision-runner.js`, `api/src/util/dbprovision.js`.
