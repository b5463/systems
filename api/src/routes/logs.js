'use strict';

const { db } = require('../db');
const { streamContainerLogs } = require('../services/docker');

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
}

module.exports = logsRoutes;
