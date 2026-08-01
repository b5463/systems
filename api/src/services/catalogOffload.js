'use strict';

// V4 Phase 5 (Alex) — precomputed catalog offload to S3/CDN.
//
// On publish, the immutable snapshot's PUBLIC (allowlisted) catalog JSON is
// written to object storage under a versioned key, and a `latest.json` pointer
// is flipped to it. A CDN/renderer can then serve the public site straight from
// S3 with zero live-DB dependency (renderer stays up during a SYSTEMS. outage).
//
// This is strictly best-effort: any failure here must NEVER break a publish —
// the DB snapshot remains the authoritative last-known-good that /api/public/*
// serves. Gated on the S3 config being present (ENABLE_OBJECT_STORAGE_BACKUPS +
// S3_* credentials, same as backup offload).

const { features } = require('../util/flags');
const objectstorage = require('./objectstorage');
const { toPublicCatalog } = require('./publicCatalog');

function enabled() {
  return features().objectStorageBackups && objectstorage.configured();
}

function catalogKey(locale, version) {
  return `catalog/${locale}/v${version}.json`;
}
function latestKey(locale) {
  return `catalog/${locale}/latest.json`;
}

// Offload one snapshot. Returns a structured result and swallows all errors
// (logging them) so the caller can ignore it. `content` is the parsed snapshot
// content; it is re-sanitised through the public allowlist before upload.
async function offloadSnapshot({ locale, version, content, publishedAt }) {
  if (!enabled()) return { offloaded: false, reason: 'disabled' };
  try {
    const isProd = process.env.NODE_ENV === 'production';
    const dto = toPublicCatalog(content, { isProd, audit: null });
    const versioned = catalogKey(locale, version);
    const body = Buffer.from(JSON.stringify({ locale, version, publishedAt, catalog: dto }));

    // 1. write the immutable versioned object, THEN 2. flip the latest pointer,
    // so a reader never sees `latest` pointing at an object that isn't there.
    await objectstorage.uploadBuffer(body, versioned, 'application/json');
    const pointer = Buffer.from(JSON.stringify({ locale, version, key: versioned, publishedAt }));
    await objectstorage.uploadBuffer(pointer, latestKey(locale), 'application/json');
    return { offloaded: true, key: versioned };
  } catch (err) {
    console.error('[catalog-offload] failed (non-fatal):', err.message);
    return { offloaded: false, reason: err.message };
  }
}

module.exports = { offloadSnapshot, catalogKey, latestKey, enabled };
