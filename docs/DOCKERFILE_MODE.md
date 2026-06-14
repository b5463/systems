# SYSTEMS. — Dockerfile Mode (V2, advanced)

> The deploy path already handles (and gates) Dockerfile projects, but actually
> building one hasn't been tried on a real server. Off by default
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
The flag defaults to false, and turning it on via env is covered by a test
(`api/test/v2.test.js`). Actually building a Dockerfile still needs a real server.
