'use strict';

// Reverse-proxy abstraction. Selects Caddy (V1.2 locked target) or nginx
// (current dev/compose) via REVERSE_PROXY. Defaults to nginx so the existing
// running stack is never broken; the Windows .env sets REVERSE_PROXY=caddy.

const caddy = require('./caddy');
const nginx = require('./nginx');

function kind() {
  return (process.env.REVERSE_PROXY || 'nginx').toLowerCase() === 'caddy' ? 'caddy' : 'nginx';
}

/**
 * Publish (or update) a system's route.
 * @param {object} o - { slug, port, visibility='public', basicUser, basicHash, apex }
 *   apex (Caddy only): also serve at the bare base domain (primary system).
 * @returns {Promise<{proxy:string, published:boolean, reload:object|undefined}>}
 */
async function publishRoute(o) {
  if (kind() === 'caddy') {
    const w = await caddy.writeRoute(o);
    const reload = w.written ? await caddy.reload() : { ok: true, reason: 'no_route' };
    return { proxy: 'caddy', published: w.written, reload };
  }
  // nginx path: only public/password get a route; private gets none.
  if (o.visibility === 'private') {
    await nginx.removeProjectRoute(o.slug).catch(() => {});
    return { proxy: 'nginx', published: false };
  }
  await nginx.addProjectRoute(o.slug, o.port);
  await nginx.reloadNginx();
  return { proxy: 'nginx', published: true };
}

async function removeRoute(slug) {
  if (kind() === 'caddy') {
    await caddy.removeRoute(slug);
    await caddy.reload();
    return { proxy: 'caddy' };
  }
  await nginx.removeProjectRoute(slug).catch(() => {});
  await nginx.reloadNginx().catch(() => {});
  return { proxy: 'nginx' };
}

module.exports = { kind, publishRoute, removeRoute };
