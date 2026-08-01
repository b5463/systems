# SYSTEMS. V4 — Phase 4 status (domains, routing, access and maintenance)

**Branch:** `claude/alex-audit-roadmap-438aha`
**Scope:** Phase 4 engineering tasks from `V4_DEVELOPER_ALLOCATION.md` (Alex).
**Updated:** 2026-08-01

---

## Implemented in this changeset

| Task | Where |
|---|---|
| Schema | `20260702170000_v4_phase4_domains_routing`: `route_status`/`route_last_error`/`route_last_published_at` on `system_environments`; verification + canonical + TLS fields on `domains`; new tables `system_environment_routes` (junction), `route_publication_attempts` (audit trail), `maintenance_windows`. Zero Prisma drift. |
| Route state machine | `services/domainrouting.js`: `canTransitionRoute` — `inactive → pending → active\|failed`, `active → superseded`. `active` is only reachable from `pending` (after a probe), never a direct jump. |
| Domain verification | `services/domainrouting.js`: 256-bit token, 48h expiry, DNS TXT record (`_systems-verify.<host> = systems-verify=<token>`), timing-safe token compare, injected resolver. Never throws on a DNS miss — returns a structured reason. |
| Route publication transaction | `services/routepublish.js`: mark `pending` → write Caddy config → validate → reload → probe the live port → mark `active`. Any failure reverts to `failed` (never `active`), records the reason, leaves the previous route file untouched, and writes a `route_publication_attempts` row. Caddy/probe deps are injected (`setDeps`) so it is unit-tested without a host. |
| Domain-driven renderRoute | `services/caddy.js`: `renderRoute({ maintenance })` serves a 503 for the whole route while a window is in effect; `renderCanonicalRedirect(fromHosts, canonicalHost)` renders a permanent redirect for non-canonical hostnames. |
| API | `routes/domains.js` (flag-gated `ENABLE_V4_SYSTEMS`, org-scoped, audited): registering a custom domain now returns real DNS instructions; `POST /api/systems/:id/domains/:domainId/verify/start` (re-issue), `.../verify` (check DNS), `.../canonical` (verified-only); maintenance `GET/POST /api/systems/:id/maintenance`, `DELETE .../maintenance/:windowId`. |
| Repos | `repo/domains.js` (verification/canonical), `repo/maintenance.js`, `repo/routes.js` — all org-scoped; org-scoping CI lint covers the new tables. |
| Tests | `api/test/v4-phase4-backend.test.js` (10): state machine, verification token/record/expiry, DNS check (match/mismatch/expiry/missing), maintenance + canonical rendering, and the DB-backed verification flow, canonical gating, maintenance CRUD, and route-publication persistence (`active` on success, `failed` on probe error, attempt recorded). |

Also fixed a latent bug the DB-backed tests surfaced: the Phase 4 domain routes
passed the legacy integer session user id as `audit_log_v4.admin_user_id`
(a UUID column), which 500'd every audited domain action once exercised against
Postgres. Now `null`, consistent with the rest of the V4 audit calls.

## Still open (host, not code)

- **Live Caddy wiring** — the maintenance/canonical renderers and the
  publication transaction are unit-tested with injected Caddy; running them
  against a real Caddy (reload + probe of a real endpoint) belongs on a Docker
  host, same posture as Phase 3.
- **TLS status + non-TXT verification** — the flow verifies via DNS TXT; the
  TLS-issued check and DNS A/CNAME verification methods are schema-ready
  (`domains.tls_status`, `verification_method`) but not implemented.
- **Deploy/promote integration** — `deployservice.promote` still publishes via
  the legacy `proxy.publishRoute`; moving it onto `routepublish.publishRoute`
  (so promotions record `route_status` + attempts) is the natural next step once
  the live Caddy path is validated on a host.

## Rollback

Disable `ENABLE_V4_SYSTEMS` — the domains/maintenance namespace goes dark
(canonical 404). The new columns default to `inactive`/`false` and are ignored
by the legacy pipeline, which still keys on `route_published` (kept mirrored to
`route_status = 'active'`).
