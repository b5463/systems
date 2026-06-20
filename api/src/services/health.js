'use strict';

const attestation = require('../util/attestation');

// Health + HTTPS checks. Performs a real HTTP(S) request and reports exactly
// what it observed. Never fabricates a status — on timeout/refusal it returns
// state:'failed' / 'unreachable'.

// Where to probe a system's health. LOCAL_MODE always uses the host port even
// when a stale/legacy route_published flag is present: local development has no
// DNS/TLS route to exercise. Outside local mode, a published route uses the real
// public URL; an unpublished/private system falls back to its host port.
// Returns null when nothing is reachable (no route, no port).
function isLocalMode(env = process.env) {
  const domain = String(env.BASE_DOMAIN || '').toLowerCase();
  return String(env.LOCAL_MODE).toLowerCase() === 'true' ||
    domain === 'localhost' || domain === '127.0.0.1';
}

function targetFor(project, env = process.env) {
  if (!project) return null;
  const localMode = isLocalMode(env);
  if (localMode && project.port) return `http://127.0.0.1:${project.port}`;
  if (project.route_published) {
    const scheme = env.PUBLIC_SCHEME || 'https';
    const domain = env.BASE_DOMAIN || 'acronym.sk';
    return `${scheme}://${project.slug}.${domain}`;
  }
  if (project.port) return `http://127.0.0.1:${project.port}`;
  return null;
}

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
 * Run a health check against a base URL (origin). Use targetFor() to derive it.
 * @returns {Promise<{state, httpStatus, responseMs, checkedAt, https}>}
 */
async function checkSystem(baseUrl, healthPath = '/') {
  const isHttps = /^https:/i.test(baseUrl);
  const url = `${baseUrl.replace(/\/+$/, '')}/${healthPath.replace(/^\/+/, '')}`;
  const r = await request(url);
  const checkedAt = new Date().toISOString();
  if (!r.ok) {
    return { state: r.error === 'timeout' ? 'timeout' : 'unreachable', httpStatus: null, responseMs: r.ms, checkedAt, https: false };
  }
  const healthy = r.status >= 200 && r.status < 400;
  return {
    state: healthy ? 'healthy' : 'unhealthy',
    httpStatus: r.status,
    responseMs: r.ms,
    checkedAt,
    https: isHttps && healthy, // TLS only counts as validated when we probed https
  };
}

async function checkAttestation(baseUrl, slug, timeoutMs = 6000) {
  const nonce = attestation.newNonce();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const checkedAt = new Date().toISOString();
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}${attestation.PATH}?nonce=${encodeURIComponent(nonce)}`;
    const response = await fetch(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: ctrl.signal,
      headers: { accept: 'application/systems-attestation+json' },
    });
    const declared = Number(response.headers?.get?.('content-length'));
    if (!response.ok || (Number.isFinite(declared) && declared > 16384)) throw new Error('attestation unavailable');
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 16384) throw new Error('attestation too large');
    const payload = attestation.open(JSON.parse(raw), { slug, nonce });
    return { state: 'verified', checkedAt, payload };
  } catch (error) {
    return { state: 'failed', checkedAt, reason: error.name === 'AbortError' ? 'timeout' : 'invalid_or_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkAttestation, checkSystem, isLocalMode, targetFor };
