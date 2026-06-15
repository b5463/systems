# SYSTEMS. — Large Uploads

The chunked upload endpoints are wired up and off by default
(`ENABLE_LARGE_UPLOADS=false`). When off, the normal limit applies
(`UPLOAD_MAX_MB=100`). When on, the cap is `V2_UPLOAD_MAX_MB` (default 2048).

The Ship screen handles the switch for you: with large uploads enabled, it
automatically uses the chunked path when a file is bigger than `UPLOAD_MAX_MB`.

## Why not just raise the limit

A large upload must never be buffered in memory. The chunked path streams
straight to a temp file on disk, with server-side size enforcement and disk
checks. Bumping `UPLOAD_MAX_MB` on its own would risk OOM, so that's not the
plan.

## Endpoints

- `POST /api/upload/init` with `{ name, slug, visibility, totalSize, totalChunks }`
  returns `{ uploadId }`.
- `POST /api/upload/:id/chunk?index=N` takes a raw `application/octet-stream`
  body. Chunks must arrive in order and are appended to a temp `.part` file on
  disk, never buffered whole in memory.
- `POST /api/upload/:id/complete` assembles the file and starts the normal build
  pipeline.
- `DELETE /api/upload/:id` cancels and cleans up.

## Validation helpers

These live in `api/src/util/upload.js`:

- `validateChunk` does the server-side cap plus chunk-index/total/size
  validation. It never trusts client-supplied sizes.
- `fitsOnDisk` is the disk quota check with a safety margin.
- `uploadTempPath` builds a traversal-safe temp path from the upload id.
- `progressState` tracks idle/uploading/assembling/complete/cancelled/failed.

## Security

Admin-only, rate-limited, archive validated, zip-slip guarded (shared
`util/pathsafe`), temp files cleaned up on failure or cancel.

Code lives in `api/src/routes/upload.js` and `api/src/util/upload.js`.
