# SYSTEMS. — Deployment (how a zip becomes a live system)

A zip turns into a running container through the pipeline below. The routing
notes call out where the production Caddy proxy differs from the dev nginx setup.

## Supported sources

- Vue/Vite source zip (built to static, served from a static container)
- Static-site zip
- Node API and custom Dockerfile are detected too, but stay behind their `.env`
  flags until you enable them

The build type is **auto-detected** from the archive contents:

| Detected | Trigger | Result |
| --- | --- | --- |
| `dockerfile` | a `Dockerfile` at root | built as-is |
| `node` | `package.json` | Node 20 Alpine image |
| `python` | `requirements.txt` / `pyproject.toml` | Python 3.12 slim image |
| `static` | none of the above | nginx static image on port 3000 |

## Pipeline

```
upload (multipart, size-capped)
  → extract zip      (zip-slip guarded; entry-count + per-file size limits)
  → detect type
  → generate Dockerfile (unless one is present)
  → docker build     (streamed to the build log over WebSocket)
  → run container    (hardened: CapDrop ALL, no-new-privileges, mem/CPU caps,
                      isolated bridge network, restart on-failure)
  → assign free host port (4000–5000 range)
  → write route file + reload reverse proxy
  → mark running → live
```

### Redeploy & rollback

- A redeploy snapshots the current image/container as the **previous** release
  before building the new one, and records a `deploy_history` row.
- The old image is **kept** (not pruned) so rollback is instant.
- Rollback stops the current container and starts the previous image on the same
  port, swapping current ↔ previous so you can toggle back.

### Environment variables

- Set per system from the **Settings** tab after the first deploy.
- Stored **AES-256-GCM encrypted** (`ENV_SECRET`); the API returns key names
  only, never values.
- Saving env vars recreates the container with the new environment.

## Routing

- **Dev (nginx):** the API writes `nginx/conf.d/{slug}.conf` and runs
  `nginx -s reload` inside the proxy container.
- **Production (Caddy):** the API writes a per-system route file into
  `systems.d/`, which the main `Caddyfile` imports, then reloads via the Caddy
  admin API (localhost-only). HTTPS is automatic per host. This path is already
  wired and needs the real host to confirm.
- **Apex / primary (Caddy):** one system can be flagged primary (Settings →
  Root domain) so its route also matches the bare base domain (e.g.
  `acronym.sk`) alongside `{slug}.acronym.sk`. The dashboard always stays on
  `systems.acronym.sk`. See [`ARCHITECTURE.md`](ARCHITECTURE.md#3-routing-model).

## Limits (configurable)

| Setting | Default | Env |
| --- | --- | --- |
| Max upload | 100 MB (hard cap 500 MB in transport) | `UPLOAD_MAX_MB` |
| Large (chunked) upload cap | 2048 MB, off unless enabled | `ENABLE_LARGE_UPLOADS` / `V2_UPLOAD_MAX_MB` |
| Build timeout | 600s, **enforced** — the build is torn down if it exceeds this | `BUILD_TIMEOUT_SECONDS` |
| Release retention | 3 (automatic pruning not implemented yet) | `RELEASE_RETENTION_DEFAULT` |

## Beyond the defaults

Chunked 2 GB uploads, per-app Postgres provisioning, custom Dockerfiles, an
in-container shell, GitHub deploy-on-push, and notifications are all built and
wired. Each is off by default behind its `.env` flag, so turn on the ones you
want. Backups are built in and on (Server → Back up now, plus an optional
scheduler). See [`V2_ROADMAP.md`](V2_ROADMAP.md) and the per-feature guides.
