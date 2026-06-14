'use strict';

const { db } = require('../db');
const { streamContainerLogs, getContainerLogs } = require('../services/docker');

/**
 * Logs routes plugin.
 */
async function logsRoutes(fastify, options) {
  /**
   * GET /api/projects/:slug/logs
   * WebSocket endpoint that streams live logs from the Docker container.
   * On connect: sends last 100 lines, then keeps streaming until client disconnects.
   */
  fastify.get('/api/projects/:slug/logs', {
    websocket: true,
    preHandler: [fastify.authenticate],
  }, async (socket, request) => {
    const { slug } = request.params;

    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) {
      socket.send(JSON.stringify({ type: 'error', message: 'Project not found' }));
      socket.close();
      return;
    }

    if (!project.container_id) {
      socket.send(JSON.stringify({ type: 'error', message: 'Project has no container' }));
      socket.close();
      return;
    }

    let logStream = null;
    let closed = false;

    const onData = (chunk) => {
      if (closed || socket.readyState !== socket.OPEN) return;
      // chunk may contain multiple lines
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (socket.readyState !== socket.OPEN) break;
        socket.send(JSON.stringify({ type: 'log', data: line + (line.endsWith('\n') ? '' : '\n') }));
      }
    };

    const onEnd = () => {
      if (closed) return;
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'end', message: 'Log stream ended' }));
        socket.close();
      }
    };

    try {
      logStream = await streamContainerLogs(project.container_id, onData, onEnd);
    } catch (err) {
      request.log.error({ err }, '[logs] Failed to stream container logs');
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'error', message: `Failed to stream logs: ${err.message}` }));
        socket.close();
      }
      return;
    }

    socket.on('close', () => {
      closed = true;
      if (logStream) {
        try {
          logStream.destroy();
        } catch (err) {
          // Ignore destroy errors
        }
        logStream = null;
      }
    });

    socket.on('error', (err) => {
      request.log.error({ err }, '[logs] WebSocket error');
      closed = true;
      if (logStream) {
        try {
          logStream.destroy();
        } catch (destroyErr) {
          // Ignore
        }
        logStream = null;
      }
    });
  });

  /**
   * GET /api/projects/:slug/logs/download
   * Returns the last 1000 lines of container logs as a plain-text attachment.
   * Docker multiplexed stream headers (8 bytes per frame) are stripped by
   * getContainerLogs() before the text is returned.
   */
  fastify.get('/api/projects/:slug/logs/download', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;

    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!project.container_id) return reply.code(400).send({ error: 'Project has no container' });

    try {
      const text = await getContainerLogs(project.container_id, 1000);
      reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${slug}-logs.txt"`)
        .send(text);
    } catch (err) {
      request.log.error({ err }, '[logs] Failed to fetch logs for download');
      return reply.code(500).send({ error: `Failed to fetch logs: ${err.message}` });
    }
  });
}

module.exports = logsRoutes;
