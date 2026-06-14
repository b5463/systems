# SYSTEMS. — Workers / Bots (V2)

> Detecting a worker and skipping its public route is written and tested.
> Actually running one hasn't been tried on a real server yet.

## What a worker is
A long-running background process (bot, queue consumer) with **no public
route**. Detected when `package.json` has a `start` script, **no** web framework
/`server.js`, and no build (`util/projectType.classify`).

## Behaviour (implemented logic)
- `routesByDefault(worker) === false` → **no Caddy route generated**.
- Health is container/process status (not HTTP).
- Same lifecycle: start/stop/restart/redeploy/delete; logs are primary;
  CPU/RAM/uptime/restart count; env vars + optional `DATABASE_URL`.

## UI (planned)
System type "Worker/Bot"; route section reads **"No public route"**; logs front
and centre.

## Events
`worker_started · worker_stopped · worker_restarted · worker_crashed · worker_redeployed`.
