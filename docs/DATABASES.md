# SYSTEMS. — Databases

SYSTEMS. can provision a per-system Postgres database. The code is wired and
tested; it's off by default because it needs a real Postgres to talk to. Turn it
on with `ENABLE_DB_PROVISIONING=true`, install the optional `pg` npm package on
the host, and set `POSTGRES_ADMIN_URL` to an admin/superuser connection string.

## How it works

`POST /api/projects/:slug/provision-db` does two things:

- creates a per-system Postgres database and a least-privilege role
- builds the resulting `DATABASE_URL` and stores it in the system's encrypted
  env, where it's picked up on the next deploy

The recommended setup is one shared Postgres with a per-system database and role
(`DB_MODE=shared`). That's the simplest thing to run and back up on a single
Windows host. A container-per-project (`DB_MODE=per-project`) is heavier and
only worth it if you need strong isolation.

Identifiers are validated and allowlisted before use, and the SQL is
parameterized rather than concatenated. The database is named
`sys_<slug_with_underscores>` and the role is `sys_<slug>_app`. The password is
random and url-safe (24 bytes). `DATABASE_URL` is stored as an encrypted env
var, masked in the UI, and never returned after it's saved.

## UI

The dashboard has a database section in Ship and System detail: a status/disk
card, backup/export, restore, reset, and delete/purge. Delete and purge require
an explicit typed confirmation.

## Events

`database_created`, `database_attached`, `backup_completed`,
`restore_completed`, `database_reset`, `database_deleted`.

## Tests

`api/test/v2.test.js` covers `dbName`/`dbUser` rejecting unsafe slugs, password
randomness and url-safety, and the URL build plus masking.

Code lives in `api/src/services/dbprovision-runner.js` and
`api/src/util/dbprovision.js`.
