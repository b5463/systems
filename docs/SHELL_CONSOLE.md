# SYSTEMS. — Shell Console

An interactive container shell. It's wired up and off by default
(`ENABLE_SHELL_CONSOLE=false`), because a shell into a container is risky. Turn
it on deliberately, and try it on a real server before you rely on it.

## Behaviour

The shell lives at `/api/projects/:slug/exec` (admin-only, WebSocket). When the
flag is off, the endpoint refuses with "Shell console is disabled". When it's
on, it attaches `/bin/sh` to the running container and audits `exec_open`.

## Why off by default

A container shell is effectively code execution on the host's Docker. It needs
to be explicit, admin-only, audited, and ideally time-limited. There's no fake
terminal: when it's disabled, the UI just shows the disabled state.

## Future hardening

Time-limited sessions, full session and command logging, and per-session
resource limits are still to come.
