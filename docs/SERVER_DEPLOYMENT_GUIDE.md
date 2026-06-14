# SYSTEMS. — Server Deployment Guide

> Status: **skeleton.** A complete, **Windows-first** version will be locked in a
> later prompt before V1.2. This outlines the standing-up steps as they work
> today (Linux-style paths shown as examples; Windows paths to be locked later).

## 0. Prerequisites

- A server with a public IP (`SERVER_IP`) and Docker + Docker Compose.
- Websupport DNS configured **manually** with a wildcard:
  ```
  A   acronym.sk     → SERVER_IP
  A   *.acronym.sk   → SERVER_IP
  ```
- Ports 80 and 443 open.

## 1. Clone & configure

```bash
git clone <repo> systems && cd systems
cp .env.example .env
# Edit .env — set at minimum:
#   JWT_SECRET, ENV_SECRET   (generate random values; see comments in .env.example)
#   ADMIN_USERS              (first admins, no public signup)
#   CORS_ORIGIN=https://systems.acronym.sk
```

## 2. Build the dashboard

```bash
cd dashboard
cp .env.example .env        # set VITE_BASE_DOMAIN etc. (non-secret)
npm install && npm run build   # outputs dashboard/dist (served by the proxy)
cd ..
```

## 3. TLS certificates (today: nginx + certbot)

```bash
# Obtain certs for the dashboard host (and wildcard handling per your setup)
docker compose --profile certbot run --rm acronym-certbot
```

> **V1.2:** Caddy replaces this step with automatic HTTPS — no certbot.

## 4. Bring it up

```bash
docker compose up -d
# Services: reverse proxy (nginx), API (Fastify), certbot (profile)
```

The API auto-creates the `acronym-isolated` Docker network and seeds admins from
`ADMIN_USERS` on first boot.

## 5. Verify

- Visit `https://systems.acronym.sk` → SYSTEMS. login.
- Sign in with an `ADMIN_USERS` credential.
- Open **Server** → confirm Docker shows **Connected**.
- Ship a small static zip → confirm it goes live at `slug.acronym.sk`.

## 6. Security checklist (do before exposing)

- [ ] `JWT_SECRET` and `ENV_SECRET` are strong and unique.
- [ ] `ADMIN_USERS` password changed from any default.
- [ ] Docker socket is **not** exposed to the network.
- [ ] Database file / Postgres is **not** publicly reachable.
- [ ] Reverse-proxy admin API is not public.
- [ ] CORS is locked to `systems.acronym.sk`.

See [`SECURITY.md`](SECURITY.md) and [`OPERATIONS.md`](OPERATIONS.md).

## TODO (later prompt: Windows-first lock)

- Windows host paths for volumes and the `systems.d`/conf.d directories.
- Windows Docker Desktop socket specifics.
- Caddy + Postgres compose definitions.
