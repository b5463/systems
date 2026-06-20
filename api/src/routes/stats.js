'use strict';

const { db } = require('../db');
const { getContainerStats } = require('../services/docker');
const { loadOr404 } = require('../util/project');
const { getSetting } = require('../util/settings');

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

    const project = loadOr404(reply, slug);
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
        // Occasionally trim old history so the table doesn't grow without bound
        // (this endpoint is polled for every running system on an interval).
        if (Math.random() < 0.02) {
          const hours = getSetting('statsRetentionHours');
          db.prepare(
            `DELETE FROM stats_history WHERE project_id = ? AND julianday(recorded_at) < julianday('now', ?)`
          ).run(project.id, `-${hours} hours`);
        }
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
   * Returns at most ~360 downsampled points within the configured retention.
   */
  fastify.get('/api/projects/:slug/stats/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;

    const project = loadOr404(reply, slug);
    if (!project) return;

    const retentionHours = getSetting('statsRetentionHours');
    let hours = Number(request.query.hours);
    if (!Number.isFinite(hours) || hours <= 0) hours = 1;
    hours = Math.min(hours, retentionHours);

    // Keep chart payloads bounded at roughly 360 points. A one-hour view uses
    // ten-second buckets; wider windows are averaged into proportionally larger
    // buckets instead of shipping every stored poll to the browser.
    const bucketSeconds = Math.max(10, Math.ceil((hours * 3600) / 360));
    const points = db.prepare(`
      SELECT
        AVG(cpu_percent) AS cpu_percent,
        AVG(memory_mb) AS memory_mb,
        AVG(rx_bytes) AS rx_bytes,
        AVG(tx_bytes) AS tx_bytes,
        MAX(recorded_at) AS recorded_at
      FROM stats_history
      WHERE project_id = ?
        AND recorded_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)
      GROUP BY CAST(CAST(strftime('%s', recorded_at) AS INTEGER) / ? AS INTEGER)
      ORDER BY recorded_at ASC
    `).all(project.id, `-${hours} hours`, bucketSeconds);

    return { points, hours, retentionHours };
  });
}

module.exports = statsRoutes;
