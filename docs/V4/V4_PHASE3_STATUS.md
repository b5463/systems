# SYSTEMS. V4 — Phase 3 status (deploy engine on Systems/Environments)

**Branch:** `claude/v4-roadmap-alexes-tasks-yhg4qi`
**Scope:** Phase 3 engineering tasks from `V4_DEVELOPER_ALLOCATION.md`.
**Updated:** 2026-07-02

---

## Architecture decision

The roadmap's end state extracts the whole pipeline into `deployService` and
makes legacy routes call it. This changeset takes the safe evolutionary step
in that direction: **one pipeline stays in production** (the proven legacy
build/redeploy/rollback code), the V4 routes drive it **through the mapping
layer**, and `v4sync` mirrors every result into the V4 model. This is
deliberately conservative — the pipeline is the highest-risk code in the
platform and this environment cannot run Docker e2e; the final inversion
(pipeline owned by deployservice, legacy routes as adapters) belongs on a
host where the e2e suite can gate it.

## Implemented in this changeset

| Task | Where |
|---|---|
| Deploy service | `api/src/services/deployservice.js`: `resolveTarget` (org-scoped system+environment+mapped-project), `deployToEnvironment`, `rollbackEnvironment`, `promote` — dependencies injectable (`setDeps`) so orchestration is unit-tested without Docker |
| New deployment routes | `POST /api/systems/:id/environments/:env/deploy\|redeploy\|rollback`, `GET .../logs\|stats`, `POST /api/systems/:id/promote` — admin auth, `ENABLE_V4_SYSTEMS`-gated (dark → canonical 404), production\|preview validated |
| Mapping-layer execution | Mapped systems redeploy their legacy project; V4-native systems get a legacy project created on first deploy and are mapped on the spot; rollback delegates to the extracted `rollbackProject` |
| Rollback extraction | The blue/green rollback moved out of the route handler into exported `rollbackProject()` (`routes/projects.js`) — behaviour unchanged, now callable by both API generations |
| Docker labels | `runContainer` merges `opts.extraLabels`; all three container-creation sites pass `systems.organisation_id`, `system_id`, `environment_id`, `slug`, `environment` for mapped systems (`v4sync.labelsForSlug`, `{}` when unmapped) |
| Pipeline → V4 mirror | `api/src/services/v4sync.js`: on deploy/redeploy/rollback success the environment's current release is recorded (previous superseded, pointers updated, idempotent); build failures refresh system status. Every hook is fail-open — a V4 problem can never break a legacy deploy. This also keeps the Phase 2.5 reconciliation green |
| Preview + production coexist | Environments resolve independently; promote flow: preview release exists → health gate (`waitForHealthy` on the preview port) → production release recorded → previous superseded (**no-op on the first-ever promotion — succeeds, never fails**) → route switch via the production project |
| Tests | `api/test/v4-phase3.test.js` (8): resolve errors, native-deploy creates+maps, mapped-deploy redeploys, rollback delegation + unmapped 409, health-gate blocks unhealthy promotion (nothing recorded), first-promotion no-op + repeat supersedes, labels + release-sync idempotency, route gating/contracts |

## Still open (host, not code)

- **E2E on a Docker host** — `deploy.e2e.test.js` extended to the V4 routes:
  one test app deploys through `POST /api/systems/:id/environments/production/deploy`,
  labels visible via `docker inspect`, rollback returns the previous release.
- **Legacy-route parity capture** (Tomas) — record identical response
  contracts legacy vs V4 for the same input on a real deploy.
- **Full pipeline inversion** — move `runBuildPipeline`/`runRedeployPipeline`
  bodies into deployservice once the e2e suite can gate the refactor
  (tracked for the tail of Phase 3, before Phase 4 route work).

## Exit-gate checklist (current state)

- [x] New systems-route deploy path works (orchestration-tested; e2e pending host)
- [x] Legacy deploy still works (207-test suite green, pipeline hooks fail-open)
- [x] Preview and production can coexist (isolated environments, promote flow)
- [x] Rollback works through both generations (shared extracted function)
- [x] Caddy routes still publish correctly (publishRoute path untouched)

## Rollback

Disable `ENABLE_V4_SYSTEMS` — the V4 deploy namespace goes dark; the legacy
pipeline never stopped being authoritative. v4sync hooks are fail-open and
no-op for unmapped projects.
