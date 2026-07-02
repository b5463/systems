'use strict';

// Per-request context carried across async boundaries (V4 Phase 0). Today it
// holds only the request ID so deep call sites — most importantly the audit
// repo — can stamp entries without threading the request object through every
// service and repository signature.

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const storage = new AsyncLocalStorage();

// Inbound X-Request-Id values are honoured so IDs correlate across the reverse
// proxy and multi-node forwarding, but only when they look like an ID — this
// string ends up in logs and the audit table, so anything else is replaced.
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

function requestIdFrom(headerValue) {
  const supplied = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (supplied && SAFE_ID.test(supplied)) return supplied;
  return crypto.randomUUID();
}

function runWithRequestId(requestId, fn) {
  return storage.run({ requestId }, fn);
}

function currentRequestId() {
  const store = storage.getStore();
  return store ? store.requestId : null;
}

module.exports = { requestIdFrom, runWithRequestId, currentRequestId };
