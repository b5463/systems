# SYSTEMS. — Large Uploads (V2, 2 GB)

> The size and chunk checks are written and tested. The actual streaming
> upload endpoint isn't wired up yet and needs trying on a real server. For now
> the limit is `UPLOAD_MAX_MB=100`; the 2 GB target is `V2_UPLOAD_MAX_MB=2048`.

## Why not just raise the limit
A 2 GB upload must **never be buffered in memory**. V2 uses **chunked/streamed**
uploads written straight to a temp file, with server-side size enforcement and
disk checks — raising `UPLOAD_MAX_MB` alone would risk OOM and is not the plan.

## Implemented (pure, tested) — `util/upload.js`
- `validateChunk` — server-side cap + chunk-index/total/size validation
  (never trusts client sizes)
- `fitsOnDisk` — disk quota check with safety margin
- `uploadTempPath` — traversal-safe temp path from upload id
- `progressState` — idle/uploading/assembling/complete/cancelled/failed

## Requires host validation
The chunk-receiving endpoint (stream to disk, assemble, hand off to the build
pipeline), resumable sessions, and cleanup on cancel/timeout — validated on the
Windows host with real Docker/disk.

## UI (planned)
Progress %, per-chunk state, cancel, disk warning, failed/retry, and a clear
"exceeds limit" message.

## Security
Admin-only, rate-limited, archive validated, zip-slip guarded (shared
`util/pathsafe`), temp files cleaned on failure/cancel, upload state in Postgres.
