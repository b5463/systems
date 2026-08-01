'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

function s3Config() {
  return {
    endpoint: process.env.S3_ENDPOINT || '',
    bucket: process.env.S3_BUCKET || 'systems-backups',
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
  };
}

function configured() {
  const cfg = s3Config();
  return !!(cfg.endpoint && cfg.accessKey && cfg.secretKey);
}

// Encode an object key for the canonical URI: percent-encode each path segment
// per RFC3986, but keep the '/' separators. The request URL and the signed
// canonical URI must be byte-identical.
function encodeS3Key(key) {
  return key.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

// AWS SigV4 signing key. The HMAC chain is date → region → service →
// 'aws4_request' (each step keyed by the previous digest). Getting this order
// wrong yields SignatureDoesNotMatch on every request. Exported for testing
// against the AWS documented vector.
function sigV4SigningKey(secretKey, dateShort, region, service) {
  return [dateShort, region, service, 'aws4_request'].reduce(
    (key, msg) => crypto.createHmac('sha256', key).update(msg).digest(),
    Buffer.from(`AWS4${secretKey}`, 'utf8'),
  );
}

// Signed PUT of a body (stream or Buffer) of a known length. Shared by the file
// and buffer uploaders so the SigV4 signing lives in exactly one place.
async function signedPut({ remoteKey, contentLength, contentType, body }) {
  const cfg = s3Config();
  const dateStr = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateShort = dateStr.slice(0, 8);

  const endpoint = cfg.endpoint.replace(/\/$/, '');
  const canonicalUri = `/${cfg.bucket}/${encodeS3Key(remoteKey)}`;
  const url = `${endpoint}${canonicalUri}`;
  // host (with port, if non-default) MUST be a signed header — SigV4 requires
  // it, and S3/MinIO reject the request otherwise. undici sets the actual Host
  // header from the URL, so we sign the same value but don't pass it to fetch.
  const host = new URL(endpoint).host;

  // Canonical + signed headers, lowercased and sorted by name.
  const signHeaders = {
    'content-length': String(contentLength),
    'content-type': contentType,
    host,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': dateStr,
  };
  const sortedKeys = Object.keys(signHeaders).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${signHeaders[k].trim()}`).join('\n') + '\n';
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    'PUT', canonicalUri, '',
    canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD',
  ].join('\n');

  const scope = `${dateShort}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', dateStr, scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = sigV4SigningKey(cfg.secretKey, dateShort, cfg.region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const fetchHeaders = {
    'Content-Length': String(contentLength),
    'Content-Type': contentType,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': dateStr,
    Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };

  const res = await fetch(url, { method: 'PUT', headers: fetchHeaders, body, duplex: 'half' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`S3 upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return { url, sizeBytes: contentLength };
}

async function uploadFile(localPath, remoteKey) {
  const stat = await fsp.stat(localPath);
  return signedPut({
    remoteKey, contentLength: stat.size,
    contentType: 'application/octet-stream', body: fs.createReadStream(localPath),
  });
}

// Upload an in-memory buffer (e.g. a serialised catalog snapshot) — no temp file.
async function uploadBuffer(buffer, remoteKey, contentType = 'application/octet-stream') {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer));
  return signedPut({ remoteKey, contentLength: buf.length, contentType, body: buf });
}

async function uploadDirectory(localDir, remotePrefix) {
  const entries = await fsp.readdir(localDir, { withFileTypes: true });
  let totalBytes = 0;
  for (const entry of entries) {
    const fullPath = path.join(localDir, entry.name);
    const remoteKey = `${remotePrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      const sub = await uploadDirectory(fullPath, remoteKey);
      totalBytes += sub.totalBytes;
    } else {
      const result = await uploadFile(fullPath, remoteKey);
      totalBytes += result.sizeBytes;
    }
  }
  return { totalBytes };
}

module.exports = { s3Config, configured, uploadFile, uploadBuffer, uploadDirectory, sigV4SigningKey, encodeS3Key };
