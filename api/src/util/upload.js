'use strict';

const path = require('path');

// Chunked/streamed upload validation for V2 (2 GB target). Pure logic for the
// chunk-session state machine; the streaming endpoint itself (writing chunks to
// a temp file without buffering in memory) is host-validated. Never trust the
// client's reported sizes — enforce server-side caps and validate every field.

function mb(n) { return n * 1024 * 1024; }

// Validate a chunk's metadata against the session + configured cap.
function validateChunk({ index, total, chunkSize, totalSize }, { maxMb = 2048 } = {}) {
  const max = mb(maxMb);
  if (!Number.isInteger(total) || total < 1 || total > 100000) return 'invalid chunk count';
  if (!Number.isInteger(index) || index < 0 || index >= total) return 'chunk index out of range';
  if (!Number.isInteger(totalSize) || totalSize <= 0) return 'invalid total size';
  if (totalSize > max) return `upload exceeds the ${maxMb} MB limit`;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) return 'invalid chunk size';
  return null; // ok
}

// Is there room on disk for this upload (plus a safety margin)?
function fitsOnDisk(totalSize, freeBytes, marginBytes = mb(512)) {
  return Number.isFinite(freeBytes) && (totalSize + marginBytes) <= freeBytes;
}

// Resolve the temp path for an upload id, guarding against traversal via id.
function uploadTempPath(uploadsDir, uploadId) {
  if (!/^[a-f0-9-]{8,64}$/i.test(String(uploadId))) return null;
  const base = path.resolve(uploadsDir);
  const p = path.resolve(base, `${uploadId}.part`);
  return p.startsWith(base + path.sep) ? p : null;
}

// Map server-side session state to a UI progress state.
function progressState({ received, total, cancelled, failed, done }) {
  if (cancelled) return 'cancelled';
  if (failed) return 'failed';
  if (done) return 'complete';
  if (!total) return 'idle';
  const pct = Math.min(100, Math.round((received / total) * 100));
  return pct >= 100 ? 'assembling' : 'uploading';
}

module.exports = { mb, validateChunk, fitsOnDisk, uploadTempPath, progressState };
