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

async function uploadFile(localPath, remoteKey) {
  const cfg = s3Config();
  const stat = await fsp.stat(localPath);
  const contentLength = stat.size;
  const dateStr = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateShort = dateStr.slice(0, 8);

  const url = `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}/${remoteKey}`;

  const body = fs.createReadStream(localPath);
  const headers = {
    'Content-Length': String(contentLength),
    'Content-Type': 'application/octet-stream',
    'x-amz-date': dateStr,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  };

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .join('\n') + '\n';
  const signedHeaders = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort()
    .join(';');

  const canonicalRequest = [
    'PUT', `/${cfg.bucket}/${remoteKey}`, '',
    canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD',
  ].join('\n');

  const scope = `${dateShort}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', dateStr, scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = ['aws4_request', 's3', cfg.region, dateShort].reduce(
    (key, msg) => crypto.createHmac('sha256', key).update(msg).digest(),
    `AWS4${cfg.secretKey}`
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, { method: 'PUT', headers, body, duplex: 'half' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`S3 upload failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return { url, sizeBytes: contentLength };
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

module.exports = { s3Config, configured, uploadFile, uploadDirectory };
