# SYSTEMS. — Dashboard

The mobile-first, installable PWA for the SYSTEMS. self-hosted deployment
engine. It is built with Vue 3 (Composition API), Vite, vue-router, Pinia,
Chart.js, and xterm.js.

## Features

- HttpOnly cookie sessions for REST and WebSockets; session-bound CSRF headers on every mutation
- Systems overview with honest runtime, route, TLS, and health state
- System detail tabs: Overview, Deployments, Logs, Metrics, Console, Settings
- Zip analysis and deployment with upload progress and live build logs
- Lifecycle controls, rollback, route retry, visibility, root-domain assignment,
  encrypted environment variables, repository mapping, and optional DB setup
- Events/audit feed, server health and cleanup tools, backup controls, admin
  sessions, password changes, and optional TOTP two-factor authentication
- Installable PWA with offline app shell, dark theme, safe-area aware bottom nav

## Development

```bash
npm install
npm run dev
```

The dev server proxies `/api` (REST + WebSockets) to `http://localhost:3000`,
so run the backend API locally on port 3000.

Copy `.env.example` to `.env` when the dashboard should preview a domain other
than `acronym.sk`. Vite variables are build-time public configuration; never put
secrets in them.

## Build

```bash
npm run build
```

This produces a static bundle in `dist/`. The reverse proxy serves the bundle
and forwards `/api` (including WebSocket upgrades) to the backend. Production
uses Caddy; the root Compose file retains nginx for the Linux/dev path. Because
the app uses history-mode routing, the selected proxy must fall back to
`index.html` for unknown paths. The service worker (`vite-plugin-pwa`,
`autoUpdate`) caches the app shell while excluding `/api` responses.

## Notes

- Env var values are never displayed — the API only returns key names. Saving
  env vars restarts the container.
- The interactive Console tab only works while the target system is running and
  `ENABLE_SHELL_CONSOLE=true`.
- Manual health checks are offered for running public systems and for all running
  systems in local mode. The API checks private or unpublished systems through
  their host port, and deploy/redeploy schedules that check automatically.
