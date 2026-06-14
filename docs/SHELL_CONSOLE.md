# SYSTEMS. — Shell Console (V2)

> This works but is off by default (`ENABLE_SHELL_CONSOLE=false`), because a
> shell into a container is risky. Turn it on deliberately, and try it on a real
> server before relying on it.

## Behaviour (implemented)
The interactive container shell (`/api/projects/:slug/exec`, admin-only,
WebSocket) is **gated**: when the flag is off the endpoint refuses with
"Shell console is disabled". When on, it attaches `/bin/sh` to the running
container and audits `exec_open`.

## Why off by default
A container shell is effectively code execution on the host's Docker. It must be
explicit, admin-only, audited, and ideally time-limited (session limits are a
future hardening step). There is **no fake terminal** — when disabled the UI
shows the disabled state.

## Future hardening (planned)
Time-limited sessions, full session/command logging, per-session resource
limits.
