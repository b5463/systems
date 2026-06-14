# SYSTEMS. — Deployment (how a zip becomes a live system)

> Status: V1.1. Describes the **current** deploy pipeline (nginx-based) and
> notes the V1.2 Caddy changes inline.

## Supported sources (V1 / V1.1)

- Vue/Vite source zip (built to static, served from a static container)
- Static-site zip
- (Detected, gated for later) Node API, custom Dockerfile

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

- **Today (nginx):** the API writes `nginx/conf.d/{slug}.conf` and runs
  `nginx -s reload` inside the proxy container.
- **V1.2 (Caddy):** the API will write a per-system route file into `systems.d/`
  which the main `Caddyfile` imports, then reload via the Caddy admin API
  (localhost-only). HTTPS becomes automatic per host.

## Limits (configurable)

| Setting | Default | Env |
| --- | --- | --- |
| Max upload | 100 MB (hard cap 500 MB in transport) | `UPLOAD_MAX_MB` |
| Build timeout | 600s (planned enforcement) | `BUILD_TIMEOUT_SECONDS` |
| Release retention | 3 (planned pruning) | `RELEASE_RETENTION_DEFAULT` |

## Not yet (V2)

2 GB chunked/streaming uploads, databases, workers, GitHub deploys,
backups/restores. See [`V2_ROADMAP.md`](V2_ROADMAP.md).
