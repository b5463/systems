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
      return { ...stats, status: project.status };
    } catch (err) {
      request.log.error({ err }, '[stats] Failed to get container stats');
      return reply.code(500).send({ error: `Failed to get stats: ${err.message}` });
    }
  });
}

module.exports = statsRoutes;
