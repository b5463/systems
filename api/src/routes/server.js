'use strict';

const Docker = require('dockerode');
const { db } = require('../db');

const PLATFORM_VERSION = '1.1.0';

/**
 * Read-only server status.
 *
 * This route never asserts a component is healthy unless it has actually
 * observed it. Anything it cannot verify from inside the API container is
 * reported honestly as `unknown` / `not_measured` rather than faked as online.
 */
async function serverRoutes(fastify, options) {
  fastify.get('/api/server/info', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const info = {
      platform: {
        name: 'SYSTEMS.',
        version: PLATFORM_VERSION,
        baseDomain: process.env.BASE_DOMAIN || null,
        dashboardDomain: process.env.DASHBOARD_DOMAIN || null,
        wildcardDomain: process.env.WILDCARD_DOMAIN || null,
      },
      docker: { status: 'unavailable', managed: null, running: null },
      reverseProxy: {
        // The current build ships behind nginx. Caddy is the V1.2 target.
        type: (process.env.REVERSE_PROXY || 'nginx').toLowerCase(),
        status: 'unknown',
      },
      database: {
        // SQLite today; Postgres is the documented V1.2 migration target.
        type: 'sqlite',
        status: 'connected',
      },
      wildcard: {
        domain: process.env.WILDCARD_DOMAIN || null,
        // DNS resolution is configured manually in Websupport and cannot be
        // verified from inside the container — never claim it is live.
        status: 'not_measured',
      },
    };

    // Docker — the only component we can actually probe. Defensive throughout.
    try {
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      await docker.ping();
      info.docker.status = 'connected';

      try {
        const managed = await docker.listContainers({
          all: true,
          filters: JSON.stringify({ label: ['managed=acronym-deploy'] }),
        });
        info.docker.managed = managed.length;
        info.docker.running = managed.filter((c) => c.State === 'running').length;
      } catch {
        /* container listing is best-effort */
      }
    } catch {
      info.docker.status = 'unavailable';
    }

    // Database — report what we truly know: that we can query it.
    try {
      db.prepare('SELECT 1').get();
      info.database.status = 'connected';
    } catch {
      info.database.status = 'unavailable';
    }

    return info;
  });
}

module.exports = serverRoutes;
