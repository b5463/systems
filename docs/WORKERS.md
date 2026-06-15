# SYSTEMS. — Workers / Bots

A worker is a long-running background process (a bot, a queue consumer) with no
public route. SYSTEMS. detects one when `package.json` has a `start` script but
no web framework or `server.js` and no build step (`util/projectType.classify`).
The detection logic is written and tested. Running an actual worker hasn't been
tried on a real server yet.

There's no public route for a worker, so there's no API endpoint to call here.
The behaviour falls out of the deploy pipeline.

## Behaviour

- `routesByDefault(worker) === false`, so no Caddy route is generated.
- Health comes from container/process status, not an HTTP check.
- It uses the same lifecycle as everything else: start, stop, restart, redeploy,
  delete. Logs are the primary signal, alongside CPU/RAM/uptime/restart count
  and env vars plus an optional `DATABASE_URL`.

## UI

System type shows as "Worker/Bot", the route section reads "No public route",
and logs are front and centre. This part isn't built yet.

## Events

`worker_started`, `worker_stopped`, `worker_restarted`, `worker_crashed`,
`worker_redeployed`.
