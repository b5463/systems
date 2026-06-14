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

// dockerode is loaded lazily so the pure route-generation logic can be used
// (and tested) without the Docker dependency present.
function getDocker() {
  const Docker = require('dockerode');
  return new Docker({ socketPath: '/var/run/docker.sock' });
}

function systemsDir() {
  return process.env.CADDY_SYSTEMS_DIR
    || path.join(process.env.SYSTEMS_DATA_DIR || '/var/lib/systems', 'caddy', 'systems.d');
}
function caddyfilePath() {
  return process.env.CADDY_CONFIG_PATH
    || path.join(process.env.SYSTEMS_DATA_DIR || '/var/lib/systems', 'caddy', 'Caddyfile');
}
function baseDomain() {
  return process.env.BASE_DOMAIN || 'acronym.sk';
}
function containerName(slug) {
  return `systems-${slug}`;
}
function routeFile(slug) {
  return path.join(systemsDir(), `${slug}.caddy`);
}

/**
 * Generate the Caddy route file content for a system.
 * @param {object} opts - { slug, port=3000, visibility, basicUser, basicHash }
 */
function renderRoute({ slug, port = 3000, visibility = 'public', basicUser, basicHash }) {
  const host = `${slug}.${baseDomain()}`;
  const target = `${containerName(slug)}:${port}`;
  if (visibility === 'password' && basicUser && basicHash) {
    return `# managed by SYSTEMS. — ${slug} (password)
${host} {
\tbasic_auth {
\t\t${basicUser} ${basicHash}
\t}
\treverse_proxy ${target}
}
`;
  }
  return `# managed by SYSTEMS. — ${slug} (public)
${host} {
\treverse_proxy ${target}
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
  systemsDir, caddyfilePath, baseDomain, containerName, routeFile,
  renderRoute, writeRoute, removeRoute, validate, reload,
};
