'use strict';

const Docker = require('dockerode');
const bcrypt = require('bcrypt');
const fsp = require('fs/promises');
const path = require('path');
const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');
const proxy = require('../services/proxy');
const health = require('../services/health');
const { confirmMatches } = require('../util/thresholds');

// Strip the basic-auth hash before any project row leaves the API. It is not
// plaintext, but a bcrypt hash should never be exposed to clients.
function pub(p) { if (p) delete p.basic_hash; return p; }

async function projectsRoutes(fastify, options) {
  fastify.get('/api/projects', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all().map(pub);
    return { projects };
  });

  fastify.get('/api/projects/:slug', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { project: pub(project) };
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

      return { project: pub(db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)) };
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

      return { project: pub(db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)) };
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

      return { project: pub(db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)) };
    } catch (err) {
      request.log.error({ err }, '[projects] Failed to restart container');
      return reply.code(500).send({ error: `Failed to restart: ${err.message}` });
    }
  });

  // DELETE = soft: stop+remove the container and pull the public route, but
  // KEEP the system row, releases, history and events. The system becomes
  // status 'deleted' and can later be purged.
  fastify.delete('/api/projects/:slug', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const errors = [];
    if (project.container_id) {
      try { if (project.status === 'running') await dockerService.stopContainer(project.container_id); } catch (err) { errors.push(`Stop: ${err.message}`); }
      try { await dockerService.removeContainer(project.container_id, true); } catch (err) { errors.push(`Remove container: ${err.message}`); }
    }
    try { await proxy.removeRoute(slug); } catch (err) { errors.push(`Remove route: ${err.message}`); }

    db.prepare(`UPDATE projects SET status = 'deleted', container_id = NULL, route_published = 0, updated_at = datetime('now') WHERE slug = ?`).run(slug);
    auditLog({ user_id: request.user.id, action: 'delete', target: slug, ip: request.ip });
    return { message: 'System deleted (history kept). Purge to remove permanently.', warnings: errors.length ? errors : undefined };
  });

  // PURGE = hard: remove container, image, route, release files and the row
  // itself. Requires typing the slug as confirmation.
  fastify.post('/api/projects/:slug/purge', {
    preHandler: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'string' } } } },
  }, async (request, reply) => {
    const { slug } = request.params;
    if (!confirmMatches(request.body.confirm, slug)) {
      return reply.code(400).send({ error: 'Confirmation does not match the system slug.' });
    }
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const errors = [];
    if (project.container_id) {
      try { await dockerService.stopContainer(project.container_id); } catch {}
      try { await dockerService.removeContainer(project.container_id, true); } catch (err) { errors.push(`Remove container: ${err.message}`); }
    }
    for (const img of [project.image_id, project.previous_image_id]) {
      if (img) { try { await dockerService.removeImage(img, true); } catch (err) { errors.push(`Remove image: ${err.message}`); } }
    }
    try { await proxy.removeRoute(slug); } catch (err) { errors.push(`Remove route: ${err.message}`); }
    // release files (best-effort, scoped to this slug)
    try {
      const dir = process.env.DEPLOYMENTS_DIR || path.join(process.env.SYSTEMS_DATA_DIR || '/var/lib/systems', 'releases');
      await fsp.rm(path.join(dir, slug), { recursive: true, force: true });
    } catch (err) { errors.push(`Remove releases: ${err.message}`); }

    db.prepare('DELETE FROM projects WHERE slug = ?').run(slug); // cascades deploy_history/stats_history
    auditLog({ user_id: request.user.id, action: 'purge', target: slug, ip: request.ip });
    return { message: 'System purged.', warnings: errors.length ? errors : undefined };
  });

  // Change visibility: republishes (or removes) the public route accordingly.
  fastify.patch('/api/projects/:slug/visibility', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['visibility'],
        properties: {
          visibility: { type: 'string', enum: ['public', 'password', 'private'] },
          username: { type: 'string', maxLength: 64 },
          password: { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { visibility, username, password } = request.body;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (project.status === 'deleted') return reply.code(409).send({ error: 'System is deleted.' });

    let basicUser = project.basic_user;
    let basicHash = project.basic_hash;
    if (visibility === 'password') {
      if (!username || !password) return reply.code(400).send({ error: 'Username and password are required for password protection.' });
      basicUser = username;
      basicHash = await bcrypt.hash(password, 12); // Caddy basic_auth accepts bcrypt
    } else {
      basicUser = null; basicHash = null;
    }

    let published = false;
    const errors = [];
    try {
      const r = await proxy.publishRoute({ slug, port: project.port, visibility, basicUser, basicHash });
      published = r.published;
      if (r.reload && r.reload.ok === false && r.reload.reason !== 'no_route' && r.reload.reason !== 'caddy_not_found') {
        errors.push(`Proxy reload: ${r.reload.reason}`);
      }
    } catch (err) { errors.push(`Route: ${err.message}`); }

    db.prepare(`UPDATE projects SET visibility = ?, basic_user = ?, basic_hash = ?, route_published = ?, updated_at = datetime('now') WHERE slug = ?`)
      .run(visibility, basicUser, basicHash, published ? 1 : 0, slug);
    auditLog({ user_id: request.user.id, action: 'visibility_change', target: slug, detail: visibility, ip: request.ip });

    const updated = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    delete updated.basic_hash; // never return the hash
    return { project: updated, warnings: errors.length ? errors : undefined };
  });

  // Run a real health + HTTPS check against the public URL and store the result.
  fastify.post('/api/projects/:slug/health', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (project.visibility === 'private') {
      return reply.code(400).send({ error: 'Private systems have no public URL to check.' });
    }
    const host = `${slug}.${process.env.BASE_DOMAIN || 'acronym.sk'}`;
    const result = await health.checkSystem(host, '/');
    db.prepare(`UPDATE projects SET health_state = ?, health_status = ?, health_response_ms = ?, health_checked_at = ? WHERE slug = ?`)
      .run(result.state, result.httpStatus, result.responseMs, result.checkedAt, slug);
    auditLog({ user_id: request.user.id, action: result.state === 'healthy' ? 'health_ok' : 'health_fail', target: slug, detail: `${result.state} ${result.httpStatus ?? ''}`.trim(), ip: request.ip });
    return { health: result };
  });

  // Roll back to the previously deployed image.
  fastify.post('/api/projects/:slug/rollback', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (project.status === 'building') return reply.code(409).send({ error: 'Currently building' });
    if (!project.previous_image_id) {
      return reply.code(400).send({ error: 'No previous deploy to roll back to.' });
    }

    const currentContainerId = project.container_id;
    const currentImageId = project.image_id;
    const targetImageId = project.previous_image_id;

    // Carry over existing env vars (same as redeploy).
    let envVars = {};
    if (project.env_vars) {
      try {
        const { decryptEnvVars } = require('./env');
        envVars = decryptEnvVars(project.env_vars);
      } catch (e) {
        // start without env vars rather than fail the rollback
      }
    }

    try {
      // Stop + remove the current container.
      if (currentContainerId) {
        try { await dockerService.stopContainer(currentContainerId); } catch (e) { /* already stopped */ }
        try { await dockerService.removeContainer(currentContainerId, true); } catch (e) { /* gone */ }
      }

      // Start a new container from the previous image, same port + env vars.
      const newContainerId = await dockerService.runContainer(slug, targetImageId, project.port, envVars);

      // Swap current <-> previous so a subsequent rollback returns to the
      // version we just rolled away from.
      db.prepare(`
        UPDATE projects
        SET status = 'running',
            container_id = ?, image_id = ?,
            previous_container_id = ?, previous_image_id = ?,
            updated_at = datetime('now')
        WHERE slug = ?
      `).run(newContainerId, targetImageId, currentContainerId || null, currentImageId || null, slug);

      auditLog({ user_id: request.user.id, action: 'rollback', target: slug, ip: request.ip });

      return { project: pub(db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)) };
    } catch (err) {
      request.log.error({ err }, '[projects] Rollback failed');
      db.prepare(`UPDATE projects SET status = 'error', updated_at = datetime('now') WHERE slug = ?`).run(slug);
      return reply.code(500).send({ error: `Rollback failed: ${err.message}` });
    }
  });

  // Provision a dedicated Postgres database + least-privilege role for a system
  // and stash the DATABASE_URL into its (encrypted) env, picked up on next
  // deploy. OFF unless ENABLE_DB_PROVISIONING and a Postgres admin URL are set.
  fastify.post('/api/projects/:slug/provision-db', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { features } = require('../util/flags');
    if (!features().dbProvisioning) return reply.code(404).send({ error: 'Database provisioning is not enabled.' });

    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const runner = require('../services/dbprovision-runner');
    const result = await runner.provision(slug);
    if (!result.ok) return reply.code(503).send({ error: result.reason });

    // Merge DATABASE_URL into the system's env (encrypted) for the next deploy.
    try {
      const env = require('./env');
      let vars = {};
      if (project.env_vars) { try { vars = env.decryptEnvVars(project.env_vars); } catch {} }
      vars.DATABASE_URL = result.url;
      db.prepare(`UPDATE projects SET env_vars = ?, updated_at = datetime('now') WHERE slug = ?`).run(env.encryptEnvVars(vars), slug);
    } catch { /* env storage best-effort (e.g. ENV_SECRET unset) */ }

    auditLog({ user_id: request.user.id, action: 'db_provisioned', target: slug, detail: result.database, ip: request.ip });
    return { ok: true, database: result.database, user: result.user, databaseUrl: result.masked };
  });

  // Map a system to a GitHub repo + branch for deploy-on-push. Setting the repo
  // does nothing until ENABLE_GITHUB_DEPLOYS is on and a webhook is configured.
  fastify.patch('/api/projects/:slug/repo', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          repo: { type: ['string', 'null'], maxLength: 140 },
          branch: { type: 'string', maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    let repo = request.body.repo;
    if (repo != null) {
      repo = String(repo).trim();
      if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        return reply.code(400).send({ error: 'Repo must look like "owner/name".' });
      }
      if (!repo) repo = null;
    }
    const branch = (request.body.branch && String(request.body.branch).trim()) || project.deploy_branch || 'main';

    db.prepare(`UPDATE projects SET repo = ?, deploy_branch = ?, updated_at = datetime('now') WHERE slug = ?`)
      .run(repo, branch, slug);
    auditLog({ user_id: request.user.id, action: 'repo_set', target: slug, detail: repo ? `${repo}@${branch}` : 'cleared', ip: request.ip });
    return { project: pub(db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)) };
  });

  // Last 10 deploy-history rows for a project.
  fastify.get('/api/projects/:slug/deploy-history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const history = db.prepare(`
      SELECT id, image_id, container_id, deployed_at
      FROM deploy_history
      WHERE project_id = ?
      ORDER BY deployed_at DESC, id DESC
      LIMIT 10
    `).all(project.id);

    return { history };
  });
}

module.exports = projectsRoutes;
