'use strict';

const { statsRepo } = require('../repo');
const { getContainerStats } = require('../services/docker');
const { loadOr404 } = require('../util/project');
const { getSetting } = require('../util/settings');
const { nonNegativeMetric } = require('../util/stats');

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

    const project = await loadOr404(reply, slug);
    if (!project) return;

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
      const safeStats = { ...stats, cpu_percent: nonNegativeMetric(stats.cpu_percent) };

      // Fire-and-forget: persist a snapshot for historical charts.
      // Never block (or fail) the live-stats response on the write.
      try {
        await statsRepo.insertStats({
          project_id: project.id,
          cpu_percent: safeStats.cpu_percent,
          memory_mb: stats.memory_mb ?? 0,
          memory_limit_mb: stats.memory_limit_mb ?? 0,
          rx_bytes: stats.rx_bytes ?? 0,
          tx_bytes: stats.tx_bytes ?? 0,
        });
        // Occasionally trim old history so the table doesn't grow without bound
        // (this endpoint is polled for every running system on an interval).
        if (Math.random() < 0.02) {
          const hours = await getSetting('statsRetentionHours');
          await statsRepo.pruneOlderThan(project.id, hours);
        }
      } catch (writeErr) {
        request.log.warn({ err: writeErr }, '[stats] Failed to persist stats history');
      }

      return { ...safeStats, status: project.status };
    } catch (err) {
      request.log.error({ err }, '[stats] Failed to get container stats');
      return reply.code(500).send({ error: `Failed to get stats: ${err.message}` });
    }
  });

  /**
   * GET /api/projects/:slug/stats/history?hours=1
   * Returns at most ~360 downsampled points within the configured retention.
   */
  fastify.get('/api/projects/:slug/stats/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;

    const project = await loadOr404(reply, slug);
    if (!project) return;

    const retentionHours = await getSetting('statsRetentionHours');
    let hours = Number(request.query.hours);
    if (!Number.isFinite(hours) || hours <= 0) hours = 1;
    hours = Math.min(hours, retentionHours);

    // Keep chart payloads bounded at roughly 360 points. A one-hour view uses
    // ten-second buckets; wider windows are averaged into proportionally larger
    // buckets instead of shipping every stored poll to the browser.
    const bucketSeconds = Math.max(10, Math.ceil((hours * 3600) / 360));
    const rawPoints = await statsRepo.getHistory(project.id, hours, bucketSeconds);

    const points = rawPoints.map((point) => ({
      ...point,
      cpu_percent: nonNegativeMetric(point.cpu_percent),
    }));

    return { points, hours, retentionHours };
  });
}

module.exports = statsRoutes;
