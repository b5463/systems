# SYSTEMS. — Large Uploads (V2)

> The chunked/streamed upload endpoints are wired up, but off by default
> (`ENABLE_LARGE_UPLOADS=false`). When off, the V1 limit (`UPLOAD_MAX_MB=100`)
> applies. The cap when enabled is `V2_UPLOAD_MAX_MB` (default 2048).

## Why not just raise the limit
A large upload must **never be buffered in memory**. V2 uses **chunked/streamed**
uploads written straight to a temp file, with server-side size enforcement and
disk checks — raising `UPLOAD_MAX_MB` alone would risk OOM and is not the plan.

## Endpoints
- `POST /api/upload/init` `{ name, slug, visibility, totalSize, totalChunks }`
  → `{ uploadId }`
- `POST /api/upload/:id/chunk?index=N` — raw `application/octet-stream` body;
  chunks must arrive in order and are appended to a temp `.part` file on disk
  (never buffered whole in memory)
- `POST /api/upload/:id/complete` — assembles the file and starts the normal
  build pipeline
- `DELETE /api/upload/:id` — cancels and cleans up

## Validation helpers — `api/src/util/upload.js`
- `validateChunk` — server-side cap + chunk-index/total/size validation
  (never trusts client sizes)
- `fitsOnDisk` — disk quota check with safety margin
- `uploadTempPath` — traversal-safe temp path from upload id
- `progressState` — idle/uploading/assembling/complete/cancelled/failed

## Security
Admin-only, rate-limited, archive validated, zip-slip guarded (shared
`util/pathsafe`), temp files cleaned on failure/cancel.

Code: `api/src/routes/upload.js`, `api/src/util/upload.js`.
