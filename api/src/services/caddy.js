'use strict';

// Caddy route management (V1.2 reverse proxy).
//
// Writes one route file per public/password system into CADDY_SYSTEMS_DIR
// (default Windows: C:\ProgramData\SYSTEMS\caddy\systems.d), then reloads Caddy.
// Private systems get NO route file. All reload/validate calls are guarded:
// if Caddy is not reachable they log and return false rather than throwing, so
// a missing Caddy never crashes the API.

const fsp = require('fs/promises');
const path = require('path');
const { isValidSlug } = require('../util/slug');
const { DATA_DIR } = require('../util/paths');
const attestation = require('../util/attestation');

// dockerode is loaded lazily so the pure route-generation logic can be used
// (and tested) without the Docker dependency present.
function getDocker() {
  return require('./docker').createDocker();
}

function systemsDir() {
  return process.env.CADDY_SYSTEMS_DIR
    || path.join(DATA_DIR, 'caddy', 'systems.d');
}
function caddyfilePath() {
  return process.env.CADDY_CONFIG_PATH
    || path.join(DATA_DIR, 'caddy', 'Caddyfile');
}
function baseDomain() {
  return process.env.BASE_DOMAIN || 'acronym.sk';
}
function appUpstreamHost() {
  const value = process.env.SYSTEMS_APP_UPSTREAM_HOST || 'host.docker.internal';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value)) {
    throw new Error('Invalid SYSTEMS_APP_UPSTREAM_HOST');
  }
  return value;
}
function routeFile(slug) {
  return path.join(systemsDir(), `${slug}.caddy`);
}

/**
 * Generate the Caddy route file content for a system.
 * @param {object} opts - { slug, port=3000, visibility, basicUser, basicHash, apex }
 *   apex: also serve this system at the bare base domain (e.g. acronym.sk),
 *   in addition to {slug}.base — used for the designated primary system.
 */
function renderRoute({ slug, port = 3000, visibility = 'public', basicUser, basicHash, apex = false }) {
  if (!isValidSlug(slug)) throw new Error('invalid slug');
  const hosts = [`${slug}.${baseDomain()}`];
  if (apex) hosts.push(baseDomain());
  const host = hosts.join(', ');
  const target = `${appUpstreamHost()}:${port}`;
  const tag = `${visibility === 'password' ? 'password' : 'public'}${apex ? ', apex' : ''}`;
  const upstream = attestation.internalUpstream();
  const credential = attestation.routeCredential(slug);
  // basicUser/basicHash are interpolated into the Caddyfile, so a username with
  // whitespace, braces, or newlines could break out of the basic_auth block and
  // inject arbitrary directives. Constrain both to safe charsets.
  if (visibility === 'password' && basicUser && basicHash) {
    if (!/^[A-Za-z0-9._@-]{1,64}$/.test(basicUser)) throw new Error('invalid basic_auth username');
    if (!/^[A-Za-z0-9$./-]+$/.test(basicHash)) throw new Error('invalid basic_auth hash');
  }
  const auth = visibility === 'password' && basicUser && basicHash
    ? `\t\tbasic_auth {\n\t\t\t${basicUser} ${basicHash}\n\t\t}\n`
    : '';
  return `# managed by SYSTEMS. — ${slug} (${tag})
${host} {
\thandle ${attestation.PATH} {
\t\trewrite * /api/internal/attestation/${slug}
\t\treverse_proxy ${upstream} {
\t\t\theader_up X-Systems-Route-Credential ${credential}
\t\t}
\t}
\thandle {
${auth}\t\treverse_proxy ${target}
\t}
}
`;
}

/**
 * Write/replace a system's route file. Private systems are removed (no route).
 * @returns {Promise<{written:boolean, path:string}>}
 */
async function writeRoute(opts) {
  if (!isValidSlug(opts.slug)) throw new Error('invalid slug');
  if (opts.visibility === 'private') {
    await removeRoute(opts.slug);
    return { written: false, path: routeFile(opts.slug) };
  }
  await fsp.mkdir(systemsDir(), { recursive: true });
  const file = routeFile(opts.slug);
  await fsp.writeFile(file, renderRoute(opts), 'utf8');
  return { written: true, path: file };
}

async function removeRoute(slug) {
  if (!isValidSlug(slug)) return;
  try { await fsp.unlink(routeFile(slug)); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}

function findCaddyContainer() {
  const name = process.env.CADDY_CONTAINER || 'caddy';
  const docker = getDocker();
  return docker.listContainers({ filters: JSON.stringify({ name: [name] }) })
    .then((list) => (list[0] ? docker.getContainer(list[0].Id) : null))
    .catch(() => null);
}

async function exec(container, cmd) {
  const e = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
  return new Promise((resolve) => {
    e.start({ hijack: true }, (err, stream) => {
      if (err) return resolve({ ok: false, out: String(err.message || err) });
      let out = '';
      stream.on('data', (c) => { out += c.toString(); });
      stream.on('end', async () => {
        try { const d = await e.inspect(); resolve({ ok: d.ExitCode === 0, out }); }
        catch { resolve({ ok: false, out }); }
      });
      stream.on('error', () => resolve({ ok: false, out }));
    });
  });
}

/** Validate the Caddy config if a Caddy container is present. Guarded. */
async function validate() {
  try {
    const c = await findCaddyContainer();
    if (!c) return { ok: false, reason: 'caddy_not_found' };
    const r = await exec(c, ['caddy', 'validate', '--config', '/etc/caddy/Caddyfile']);
    return { ok: r.ok, reason: r.ok ? null : 'invalid_config', out: r.out };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** Reload Caddy. Guarded — returns {ok:false} instead of throwing. */
async function reload() {
  try {
    const c = await findCaddyContainer();
    if (!c) { console.warn('[caddy] container not found; skipping reload'); return { ok: false, reason: 'caddy_not_found' }; }
    const r = await exec(c, ['caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);
    if (!r.ok) console.warn('[caddy] reload failed:', r.out);
    return { ok: r.ok, reason: r.ok ? null : 'reload_failed', out: r.out };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = {
  systemsDir, caddyfilePath, baseDomain, appUpstreamHost, routeFile,
  renderRoute, writeRoute, removeRoute, validate, reload,
};
