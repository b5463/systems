'use strict';

// Health + HTTPS checks. Performs a real HTTP(S) request and reports exactly
// what it observed. Never fabricates a status — on timeout/refusal it returns
// state:'failed' / 'unreachable'.

const SCHEME = () => process.env.PUBLIC_SCHEME || 'https';

async function request(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
    return { ok: true, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message), ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Run a health check against a system's public URL.
 * @returns {Promise<{state, httpStatus, responseMs, checkedAt, https}>}
 */
async function checkSystem(host, healthPath = '/') {
  const url = `${SCHEME()}://${host}${healthPath.startsWith('/') ? '' : '/'}${healthPath}`;
  const r = await request(url);
  const checkedAt = new Date().toISOString();
  if (!r.ok) {
    return { state: r.error === 'timeout' ? 'timeout' : 'unreachable', httpStatus: null, responseMs: r.ms, checkedAt, https: r.ok };
  }
  const healthy = r.status >= 200 && r.status < 400;
  return {
    state: healthy ? 'healthy' : 'unhealthy',
    httpStatus: r.status,
    responseMs: r.ms,
    checkedAt,
    https: SCHEME() === 'https', // request over https succeeded (TLS validated by fetch)
  };
}

module.exports = { checkSystem };
