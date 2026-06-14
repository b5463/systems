'use strict';

const { db } = require('../db');
const { getContainerStats } = require('../services/docker');

/**
 * Stats routes plugin.
 */
async function statsRoutes(fastify, options) {
  /**
   * GET /api/projects/:slug/stats
   * Returns a single stats snapshot for the project's container.
   */
  fastify.get('/api/projects/:slug/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;

    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    if (!project.container_id) {
      return reply.code(400).send({ error: 'Project has no container' });
    }

    if (project.status !== 'running') {
      return {
        cpu_percent: 0,
        memory_mb: 0,
        memory_limit_mb: 0,
        rx_bytes: 0,
        tx_bytes: 0,
        status: project.status,
      };
    }

    try {
      const stats = await getContainerStats(project.container_id);

      // Fire-and-forget: persist a snapshot for historical charts.
      // Never block (or fail) the live-stats response on the write.
      try {
        db.prepare(`
          INSERT INTO stats_history
            (project_id, cpu_percent, memory_mb, memory_limit_mb, rx_bytes, tx_bytes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          project.id,
          stats.cpu_percent ?? 0,
          stats.memory_mb ?? 0,
          stats.memory_limit_mb ?? 0,
          stats.rx_bytes ?? 0,
          stats.tx_bytes ?? 0
        );
      } catch (writeErr) {
        request.log.warn({ err: writeErr }, '[stats] Failed to persist stats history');
      }

      return { ...stats, status: project.status };
    } catch (err) {
      request.log.error({ err }, '[stats] Failed to get container stats');
      return reply.code(500).send({ error: `Failed to get stats: ${err.message}` });
    }
  });

  /**
   * GET /api/projects/:slug/stats/history?hours=1
   * Returns recorded stats points within the time window (default 1h, max 24h).
   */
  fastify.get('/api/projects/:slug/stats/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;

    const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    let hours = Number(request.query.hours);
    if (!Number.isFinite(hours) || hours <= 0) hours = 1;
    if (hours > 24) hours = 24;

    const points = db.prepare(`
      SELECT cpu_percent, memory_mb, rx_bytes, tx_bytes, recorded_at
      FROM stats_history
      WHERE project_id = ?
        AND recorded_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)
      ORDER BY recorded_at ASC, id ASC
    `).all(project.id, `-${hours} hours`);

    return { points };
  });
}

module.exports = statsRoutes;
