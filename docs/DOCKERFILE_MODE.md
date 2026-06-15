# SYSTEMS. — Dockerfile Mode

The deploy path handles and gates Dockerfile projects. It's wired up and off by
default (`ENABLE_DOCKERFILE_MODE=false`). Actually building a Dockerfile still
needs a real server to confirm.

## Behaviour

If an uploaded archive contains a `Dockerfile` and the flag is off, the deploy
is rejected with a clear message. SYSTEMS. never silently runs a project
Dockerfile. With the flag on, the existing build pipeline takes over: hardened
container, resource limits, build timeout, log rotation.

## Risks

A Dockerfile runs project-defined build instructions, so treat it as untrusted.
It's admin-only, has a build timeout, enforces resource and PID limits, keeps
secrets out of build logs, and is audited. Enable it only for code you trust.

## Tests

`api/test/v2.test.js` covers the flag defaulting to false and turning it on via
env. Building an actual Dockerfile still needs a real server.
