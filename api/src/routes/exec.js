'use strict';

const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');

async function execRoutes(fastify, options) {
  // WebSocket interactive terminal — /bin/sh inside the running container
  fastify.get('/api/projects/:slug/exec', {
    websocket: true,
    preHandler: [fastify.authenticate],
  }, async (socket, request) => {
    const { slug } = request.params;

    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);

    if (!project || !project.container_id) {
      socket.send(JSON.stringify({ type: 'error', message: 'Project not found or has no container' }));
      socket.close();
      return;
    }

    if (project.status !== 'running') {
      socket.send(JSON.stringify({ type: 'error', message: 'Project is not running' }));
      socket.close();
      return;
    }

    let execStream = null;
    let closed = false;

    const onData = (data) => {
      if (closed || socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify({ type: 'output', data }));
    };

    const onEnd = () => {
      if (closed) return;
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'end' }));
        socket.close();
      }
    };

    try {
      execStream = await dockerService.execContainer(project.container_id, onData, onEnd);
    } catch (err) {
      request.log.error({ err }, '[exec] Failed to open exec session');
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'error', message: err.message }));
        socket.close();
      }
      return;
    }

    auditLog({
      user_id: request.user.id,
      action: 'exec_open',
      target: slug,
      ip: request.ip,
    });

    // Client sends { type: 'input', data: '...' } for keyboard input
    // or { type: 'resize', cols: N, rows: N } for terminal resize
    socket.on('message', (msg) => {
      if (!execStream || closed) return;
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'input') {
          execStream.write(parsed.data);
        }
        // Resize not supported via Dockerode hijacked stream — frontend should handle gracefully
      } catch (e) {
        // Treat raw non-JSON as direct input
        try { execStream.write(msg.toString()); } catch (we) { /* stream gone */ }
      }
    });

    socket.on('close', () => {
      closed = true;
      if (execStream) {
        try { execStream.destroy(); } catch (e) {}
        execStream = null;
      }
    });

    socket.on('error', (err) => {
      request.log.error({ err }, '[exec] WebSocket error');
      closed = true;
      if (execStream) {
        try { execStream.destroy(); } catch (e) {}
        execStream = null;
      }
    });
  });
}

module.exports = execRoutes;
