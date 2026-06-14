# SYSTEMS. — Dockerfile Mode (V2, advanced)

> Status: **gated & implemented in the deploy path**; building a project
> Dockerfile **requires Windows host validation**. **Disabled by default**
> (`ENABLE_DOCKERFILE_MODE=false`).

## Behaviour (implemented)
If an uploaded archive contains a `Dockerfile` and the flag is **off**, the
deploy is **rejected** with a clear message — SYSTEMS. **never silently runs a
project Dockerfile**. With the flag on, the existing build pipeline (hardened
container, resource limits, build timeout, log rotation) is used.

## Risks
A Dockerfile runs **project-defined build instructions**. Treat as untrusted:
admin-only, build timeout, resource/PIDs limits, no secrets in build logs,
audited. Enable only for code you trust.

## Repo tests
Flag defaults to false; enabling via env verified (`api/test/v2.test.js`). Live
Dockerfile build is host-validated.
