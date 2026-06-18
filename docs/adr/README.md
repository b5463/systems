# Architecture Decision Records

Short records of the decisions that shaped SYSTEMS. and *why*, so the reasoning
survives the people who made it. Format is a lightweight
[MADR](https://adr.github.io/madr/): Context → Decision → Consequences.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-admin-only-two-admin-model.md) | Admin-only, two-admin cap, no public signup | Accepted |
| [0002](0002-sqlite-default-postgres-option.md) | SQLite by default, Postgres as an option | Accepted |
| [0003](0003-caddy-reverse-proxy.md) | Caddy in production, nginx in dev | Accepted |
| [0004](0004-honest-status-reconciliation.md) | Honest status via reconciliation against Docker | Accepted |
| [0005](0005-risky-features-off-by-default.md) | Risky features built but off behind `.env` flags | Accepted |
| [0006](0006-encrypt-env-vars-at-rest.md) | Encrypt per-system env vars at rest (AES-256-GCM) | Accepted |
| [0007](0007-tamper-evident-audit-log.md) | Tamper-evident, hash-chained audit log | Accepted |

New decision? Copy the shape of an existing record, take the next number, and
add a row here.
