# Control-plane DB: Postgres + Prisma migration plan

Status: **proposed milestone — not started.** This documents *whether* and *how* to
move the SYSTEMS. control-plane database off SQLite. It is deliberately a decision
doc first, an implementation plan second.

## What "the database" means here

There are two distinct databases in SYSTEMS.:

1. **The control-plane DB** — users, sessions, projects, audit log. Today this is
   **SQLite via `better-sqlite3`** (`api/src/db/index.js`). This is the subject of
   this doc.
2. **Per-app databases** — SYSTEMS. already **provisions dedicated Postgres
   databases + roles** for deployed apps (`services/dbprovision-runner.js`,
   gated behind `ENABLE_DB_PROVISIONING`). Postgres is already the story for user
   workloads. This is **not** changing.

## Recommendation

**Keep SQLite for the control plane unless/until SYSTEMS. runs as multiple API
instances (HA / horizontal scale).** Reasons:

- **Boot independence.** The control plane must come up and stay up *even when the
  things it manages are broken* — including Postgres. A SQLite file has no network
  dependency and cannot fail to connect.
- **Synchronous transactions are load-bearing.** Two correctness-critical paths rely
  on `better-sqlite3` being synchronous:
  - the deploy **port-allocation + INSERT** critical section (`withDeployLock`), and
  - the **tamper-evident audit hash-chain** (`_writeAudit` transaction).
  Prisma is async; porting these needs careful redesign, not a find-replace.
- **Operational simplicity.** One file to back up (the backup feature already
  snapshots it). No connection pool, no migrations service, no separate uptime.

**The one scenario that justifies migrating:** running **>1 API instance** sharing
state (HA, blue/green of the control plane itself, multi-node). SQLite can't be the
shared source of truth across processes/hosts; Postgres can.

## If/when we migrate — phased plan

### Phase 0 — gate
Confirm the trigger is real (multi-instance control plane). If we're single-node,
stop here.

### Phase 1 — schema + data access seam
- Author a Prisma schema mirroring the current tables: `users`, `sessions`,
  `projects`, `audit_log`, `deploy_history`, `stats_history`.
- Introduce a thin repository layer so routes call `repo.projects.findBySlug()`
  rather than `db.prepare(...)` directly. This is the biggest mechanical change —
  ~12 route files use `db.prepare` synchronously today. Do it **while still on
  SQLite** so it's a pure refactor with no behavior change, fully testable.

### Phase 2 — async conversion
- Every repository method becomes `async`. Propagate `await` up through the routes
  (Fastify handlers are already async). Tests (99 today) must stay green at each step.

### Phase 3 — redesign the two synchronous-critical paths
- **Port allocation:** replace the in-process `withDeployLock` with a Postgres
  advisory lock (`pg_advisory_xact_lock`) or a `SELECT ... FOR UPDATE` on a port
  ledger, so concurrent API instances can't pick the same port.
- **Audit hash-chain:** wrap append-with-prev-hash in a `SERIALIZABLE` transaction
  (or advisory lock) so the chain head stays consistent under concurrent writers.

### Phase 4 — sessions + token model
- The `sessions` table already exists and works under SQLite. Under Postgres it
  becomes the shared session store (fixes the "sessions don't survive across
  instances" concern automatically). No JWT changes needed.

### Phase 5 — migrations + ops
- Adopt `prisma migrate` for schema versioning.
- Add Postgres to the deploy topology (it's already a provisioned service — reuse
  it or run a dedicated control-plane instance), connection pooling, health checks.
- Update the backup feature to `pg_dump` the control-plane DB instead of copying the
  SQLite file.

### Phase 6 — cutover
- One-time data copy SQLite → Postgres (small dataset; a script reading every table
  and inserting via Prisma).
- Run both in parallel briefly behind a flag, then flip.

## Risk register
- **Boot coupling** — the control plane now depends on Postgres being up. Mitigate
  with retry/backoff and a read-only degraded mode.
- **Async refactor blast radius** — touches every route. Mitigate with the Phase-1
  repository seam landed separately and the existing test suite as a gate.
- **Lost synchronous guarantees** — the port-lock and audit-chain redesigns are the
  highest-risk items; they need their own tests before cutover.

## Effort estimate
Rough: **1–2 focused weeks**, dominated by Phase 1 (repository seam) and Phase 3
(the two critical-path redesigns). Not a drive-by change — hence "milestone".
