# Acronym Deploy — Dashboard

A mobile-first, installable PWA for managing the Acronym self-hosted deployment
platform. Built with Vue 3 (Composition API), Vite, vue-router, Pinia,
Chart.js and xterm.js.

## Features

- JWT auth (Bearer for REST, `?token=` for WebSockets)
- App list with live status and quick CPU/RAM stats (auto-refresh every 5s)
- Per-app detail tabs: Overview, Analytics (live CPU/memory charts + network),
  Logs (live stream), Console (interactive shell), Env (key management)
- Deploy a `.zip` with upload progress + live build log streaming
- Activity / audit feed
- Installable PWA with offline app shell, dark theme, safe-area aware bottom nav

## Development

```bash
npm install
npm run dev
```

The dev server proxies `/api` (REST + WebSockets) to `http://localhost:3000`,
so run the backend API locally on port 3000.

## Build

```bash
npm run build
```

This produces a static bundle in `dist/`. In production, **nginx serves `dist/`
at the site root** and proxies `/api` to the backend. Because the app uses
history-mode routing, nginx must fall back to `index.html` for unknown paths
(SPA fallback). The service worker (vite-plugin-pwa, `autoUpdate`) caches the
app shell for offline use while never caching `/api` responses.

## Notes

- Env var values are never displayed — the API only returns key names. Saving
  env vars restarts the container.
- The interactive Console tab only works while the target app is running.
