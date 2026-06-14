'use strict';

const crypto = require('crypto');

// GitHub webhook helpers (V2, scaffold). Signature verification is pure and
// unit-tested; the deploy-on-push wiring is planned/host-validated.

// Verify an X-Hub-Signature-256 header against the raw body using the shared
// secret. Constant-time compare. `header` is e.g. "sha256=abc123…".
function verifySignature(secret, rawBody, header) {
  if (!secret || !header || typeof header !== 'string') return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

// Does a push event's ref match the configured branch? ref e.g. "refs/heads/main".
function branchAllowed(ref, branch) {
  if (!ref || !branch) return false;
  return ref === `refs/heads/${branch}`;
}

module.exports = { verifySignature, branchAllowed };
