'use strict';

const Docker = require('dockerode');
const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');
const { removeProjectRoute, reloadNginx } = require('../services/nginx');

async function projectsRoutes(fastify, options) {
  fastify.get('/api/projects', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return { projects };
  });

  fastify.get('/api/projects/:slug', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { project };
  });

  fastify.post('/api/projects/:slug/start', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!project.container_id) return reply.code(400).send({ error: 'Project has no container' });
    if (project.status === 'running') return reply.code(400).send({ error: 'Already running' });
    if (project.status === 'building') return reply.code(400).send({ error: 'Currently building' });

    try {
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      await docker.getContainer(project.container_id).start();

      db.prepare(`UPDATE projects SET status = 'running', updated_at = datetime('now') WHERE slug = ?`).run(slug);
      auditLog({ user_id: request.user.id, action: 'start', target: slug, ip: request.ip });

      return { project: db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) };
    } catch (err) {
      request.log.error({ err }, '[projects] Failed to start container');
      return reply.code(500).send({ error: `Failed to start: ${err.message}` });
    }
  });

  fastify.post('/api/projects/:slug/stop', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!project.container_id) return reply.code(400).send({ error: 'Project has no container' });
    if (project.status === 'stopped') return reply.code(400).send({ error: 'Already stopped' });
    if (project.status === 'building') return reply.code(400).send({ error: 'Currently building' });

    try {
      await dockerService.stopContainer(project.container_id);
      db.prepare(`UPDATE projects SET status = 'stopped', updated_at = datetime('now') WHERE slug = ?`).run(slug);
      auditLog({ user_id: request.user.id, action: 'stop', target: slug, ip: request.ip });

      return { project: db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) };
    } catch (err) {
      request.log.error({ err }, '[projects] Failed to stop container');
      return reply.code(500).send({ error: `Failed to stop: ${err.message}` });
    }
  });

  fastify.post('/api/projects/:slug/restart', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!project.container_id) return reply.code(400).send({ error: 'Project has no container' });
    if (project.status === 'building') return reply.code(400).send({ error: 'Currently building' });

    try {
      await dockerService.restartContainer(project.container_id);
      db.prepare(`UPDATE projects SET status = 'running', updated_at = datetime('now') WHERE slug = ?`).run(slug);
      auditLog({ user_id: request.user.id, action: 'restart', target: slug, ip: request.ip });

      return { project: db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) };
    } catch (err) {
      request.log.error({ err }, '[projects] Failed to restart container');
      return reply.code(500).send({ error: `Failed to restart: ${err.message}` });
    }
  });

  fastify.delete('/api/projects/:slug', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const errors = [];

    if (project.container_id) {
      try {
        if (project.status === 'running') await dockerService.stopContainer(project.container_id);
      } catch (err) {
        errors.push(`Stop: ${err.message}`);
      }
      try {
        await dockerService.removeContainer(project.container_id, true);
      } catch (err) {
        errors.push(`Remove container: ${err.message}`);
      }
    }

    if (project.image_id) {
      try {
        await dockerService.removeImage(project.image_id, true);
      } catch (err) {
        errors.push(`Remove image: ${err.message}`);
      }
    }

    try {
      await removeProjectRoute(slug);
      await reloadNginx();
    } catch (err) {
      errors.push(`Remove nginx config: ${err.message}`);
    }

    db.prepare('DELETE FROM projects WHERE slug = ?').run(slug);
    auditLog({ user_id: request.user.id, action: 'delete', target: slug, ip: request.ip });

    return { message: 'Project deleted', warnings: errors.length > 0 ? errors : undefined };
  });
}

module.exports = projectsRoutes;
