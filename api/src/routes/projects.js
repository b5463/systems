'use strict';

const bcrypt = require('bcrypt');
const fsp = require('fs/promises');
const path = require('path');
const { projectRepo, auditRepo } = require('../repo');
const dockerService = require('../services/docker');
const proxy = require('../services/proxy');
const health = require('../services/health');
const { confirmMatches } = require('../util/thresholds');
const { projectContainerOptions } = require('../util/limits');
const { pub, loadOr404 } = require('../util/project');
const { parsePagination, paginationEnvelope } = require('../util/pagination');
const { DATA_DIR } = require('../util/paths');

async function projectsRoutes(fastify, options) {
  fastify.get('/api/projects', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const all = (await projectRepo.listAll()).map(pub);
    const q = request.query || {};
    if (q.page || q.per_page || q.perPage) {
      const pg = parsePagination(q);
      const slice = all.slice(pg.offset, pg.offset + pg.perPage);
      const { pagination } = paginationEnvelope(slice, all.length, pg);
      return { projects: slice, pagination };
    }
    return { projects: all };
  });

  fastify.get('/api/projects/:slug', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    return { project: pub(project) };
  });

  fastify.post('/api/projects/:slug/start', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    if (!project.container_id) return reply.code(400).send({ error: 'Project has no container' });
    if (project.status === 'running') return reply.code(400).send({ error: 'Already running' });
    if (project.status === 'building') return reply.code(400).send({ error: 'Currently building' });

    try {
      await dockerService.startContainer(project.container_id);

      await projectRepo.updateStatus(slug, 'running');
      await auditRepo.appendAudit({ user_id: request.user.id, action: 'start', target: slug, ip: request.ip });

      return { project: pub(await projectRepo.findBySlug(slug)) };
    } catch (err) {
      request.log.error({ err }, '[projects] Failed to start container');
      return reply.code(500).send({ error: `Failed to start: ${err.message}` });
    }
  });

  fastify.post('/api/projects/:slug/stop', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    if (!project.container_id) return reply.code(400).send({ error: 'Project has no container' });
    if (project.status === 'stopped') return reply.code(400).send({ error: 'Already stopped' });
    if (project.status === 'building') return reply.code(400).send({ error: 'Currently building' });

    try {
      await dockerService.stopContainer(project.container_id);
      await projectRepo.updateStatus(slug, 'stopped');
      await auditRepo.appendAudit({ user_id: request.user.id, action: 'stop', target: slug, ip: request.ip });

      return { project: pub(await projectRepo.findBySlug(slug)) };
    } catch (err) {
      request.log.error({ err }, '[projects] Failed to stop container');
      return reply.code(500).send({ error: `Failed to stop: ${err.message}` });
    }
  });

  fastify.post('/api/projects/:slug/restart', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    if (!project.container_id) return reply.code(400).send({ error: 'Project has no container' });
    if (project.status === 'building') return reply.code(400).send({ error: 'Currently building' });

    try {
      await dockerService.restartContainer(project.container_id);
      await projectRepo.updateStatus(slug, 'running');
      await auditRepo.appendAudit({ user_id: request.user.id, action: 'restart', target: slug, ip: request.ip });

      return { project: pub(await projectRepo.findBySlug(slug)) };
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
    const project = await loadOr404(reply, slug);
    if (!project) return;

    const errors = [];
    if (project.container_id) {
      try { if (project.status === 'running') await dockerService.stopContainer(project.container_id); } catch (err) { errors.push(`Stop: ${err.message}`); }
      try { await dockerService.removeContainer(project.container_id, true); } catch (err) { errors.push(`Remove container: ${err.message}`); }
    }
    try { await proxy.removeRoute(slug); } catch (err) { errors.push(`Remove route: ${err.message}`); }

    await projectRepo.softDelete(slug);
    await auditRepo.appendAudit({ user_id: request.user.id, action: 'delete', target: slug, ip: request.ip });
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
    const project = await loadOr404(reply, slug);
    if (!project) return;

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
      const dir = process.env.DEPLOYMENTS_DIR || path.join(DATA_DIR, 'releases');
      await fsp.rm(path.join(dir, slug), { recursive: true, force: true });
    } catch (err) { errors.push(`Remove releases: ${err.message}`); }

    await projectRepo.hardDelete(slug);
    await auditRepo.appendAudit({ user_id: request.user.id, action: 'purge', target: slug, ip: request.ip });
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
    const project = await loadOr404(reply, slug);
    if (!project) return;
    if (project.status === 'deleted') return reply.code(409).send({ error: 'System is deleted.' });

    let basicUser, basicHash;
    if (visibility === 'password') {
      if (!username || !password) return reply.code(400).send({ error: 'Username and password are required for password protection.' });
      // The username is written verbatim into the Caddy route file, so restrict
      // it to safe characters (no whitespace/braces that could inject directives).
      if (!/^[A-Za-z0-9._-]+$/.test(username)) {
        return reply.code(400).send({ error: 'Username may only contain letters, numbers, dot, dash, and underscore.' });
      }
      basicUser = username;
      basicHash = await bcrypt.hash(password, 12); // Caddy basic_auth accepts bcrypt
    } else {
      basicUser = null; basicHash = null;
    }

    let published;
    const errors = [];
    try {
      const r = await proxy.publishRoute({ slug, port: project.port, visibility, basicUser, basicHash, apex: !!project.is_primary });
      published = r.published;
      if (r.reload && r.reload.ok === false && r.reload.reason !== 'no_route' && r.reload.reason !== 'caddy_not_found') {
        errors.push(`Proxy reload: ${r.reload.reason}`);
      }
    } catch (err) { errors.push(`Route: ${err.message}`); }

    // A private system has no public route, so it can't remain the apex/primary.
    const keepPrimary = visibility === 'private' ? 0 : project.is_primary;
    await projectRepo.updateVisibility(slug, { visibility, basicUser, basicHash, routePublished: published ? 1 : 0, isPrimary: keepPrimary });
    await auditRepo.appendAudit({ user_id: request.user.id, action: 'visibility_change', target: slug, detail: visibility, ip: request.ip });

    return { project: pub(await projectRepo.findBySlug(slug)), warnings: errors.length ? errors : undefined };
  });

  // Retry publishing the public route (e.g. after the reverse proxy comes up).
  // Re-runs publishRoute with the system's current visibility and updates
  // route_published. Rejected for private/non-running systems.
  fastify.post('/api/projects/:slug/publish-route', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    if (project.status === 'deleted') return reply.code(409).send({ error: 'System is deleted.' });
    if (project.visibility === 'private') return reply.code(400).send({ error: 'Private systems have no public route to publish.' });
    if (project.status !== 'running') return reply.code(409).send({ error: 'The system must be running to publish a route.' });

    let published;
    let reason;
    try {
      const r = await proxy.publishRoute({ slug, port: project.port, visibility: project.visibility, basicUser: project.basic_user, basicHash: project.basic_hash, apex: !!project.is_primary });
      published = r.published;
      reason = r.reload && r.reload.ok === false ? r.reload.reason : undefined;
    } catch (err) {
      return reply.code(502).send({ error: `Route publish failed: ${err.message}` });
    }
    await projectRepo.updateRoutePublished(slug, published);
    await auditRepo.appendAudit({ user_id: request.user.id, action: 'route_publish', target: slug, detail: published ? 'published' : (reason || 'not_published'), ip: request.ip });

    if (!published) {
      const msg = (reason === 'nginx_not_found' || reason === 'caddy_not_found')
        ? 'The reverse proxy is not running on this host, so no public route could be created.'
        : reason === 'conf_dir_missing'
          ? 'The proxy config directory is not available on this host.'
          : 'The route could not be published.';
      return reply.code(409).send({ error: msg, reason });
    }
    return { project: pub(await projectRepo.findBySlug(slug)) };
  });

  // Persist per-system container overrides. Docker log/resource settings are
  // applied on the next container recreation; the health path is used at once.
  fastify.patch('/api/projects/:slug/limits', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          memoryMb: { type: ['integer', 'null'], minimum: 64, maximum: 32768 },
          cpuLimit: { type: ['number', 'null'], minimum: 0.1, maximum: 32 },
          pidsLimit: { type: ['integer', 'null'], minimum: 32, maximum: 4096 },
          restartPolicy: { type: ['string', 'null'], enum: ['no', 'on-failure', 'unless-stopped', 'always', null] },
          logMaxSize: { type: ['string', 'null'], pattern: '^[1-9][0-9]{0,4}[kKmMgG]$' },
          logMaxFile: { type: ['integer', 'null'], minimum: 1, maximum: 20 },
          healthPath: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    if (project.status === 'deleted') return reply.code(409).send({ error: 'System is deleted.' });

    const body = request.body || {};
    const pick = (key, current) => Object.hasOwn(body, key) ? body[key] : current;
    const healthPath = String(pick('healthPath', project.health_path || '/')).trim();
    if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(healthPath)) {
      return reply.code(400).send({ error: 'Health path must start with / and contain only URL path characters.' });
    }

    const values = {
      memoryMb: pick('memoryMb', project.limit_memory_mb),
      cpuLimit: pick('cpuLimit', project.limit_cpu),
      pidsLimit: pick('pidsLimit', project.limit_pids),
      restartPolicy: pick('restartPolicy', project.limit_restart_policy),
      logMaxSize: pick('logMaxSize', project.limit_log_max_size),
      logMaxFile: pick('logMaxFile', project.limit_log_max_file),
    };

    await projectRepo.updateLimits(slug, { ...values, healthPath });

    await auditRepo.appendAudit({
      user_id: request.user.id,
      action: 'limits_update',
      target: slug,
      detail: JSON.stringify({ ...values, healthPath }),
      ip: request.ip,
    });
    return {
      project: pub(await projectRepo.findBySlug(slug)),
      appliesOn: 'next-container-recreation',
    };
  });

  // Run a real health + HTTPS check against the public URL and store the result.
  fastify.post('/api/projects/:slug/health', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    const target = health.targetFor(project);
    if (!target) {
      return reply.code(400).send({ error: 'Nothing to check — the system is not running and has no published route.' });
    }
    const result = await health.checkSystem(target, project.health_path || '/');
    const routeAttestation = project.route_published && !health.isLocalMode()
      ? await health.checkAttestation(target, slug)
      : { state: 'not_applicable', checkedAt: new Date().toISOString() };
    await projectRepo.updateHealth(slug, { healthState: result.state, healthStatus: result.httpStatus, healthResponseMs: result.responseMs, healthCheckedAt: result.checkedAt, attestationState: routeAttestation.state, attestationCheckedAt: routeAttestation.checkedAt });
    await projectRepo.updateHealthFailures(slug, result.state);
    await auditRepo.appendAudit({ user_id: request.user.id, action: result.state === 'healthy' ? 'health_ok' : 'health_fail', target: slug, detail: `${result.state} ${result.httpStatus ?? ''}`.trim(), ip: request.ip });
    return { health: result, routeAttestation };
  });

  // Roll back to the previously deployed image.
  fastify.post('/api/projects/:slug/rollback', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;
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

    // Determine the inactive slot for blue/green zero-downtime rollback.
    const inactiveSlot = projectRepo.getInactiveSlot(project);
    const inactivePort = projectRepo.getInactivePort(project);

    // Mark building during the swap so reconciliation (which skips 'building')
    // can't see the transient state and flip the row to 'error'.
    await projectRepo.updateStatus(slug, 'building');

    try {
      // Start from previous image on INACTIVE port (old container still serving).
      const newContainerId = await dockerService.runContainer(
        slug, targetImageId, inactivePort, envVars,
        { ...projectContainerOptions(project), slot: inactiveSlot }
      );

      // Health-gate the rollback container before switching traffic.
      try {
        await health.waitForHealthy(health.targetForPort(inactivePort), project.health_path || '/');
      } catch (healthErr) {
        try { await dockerService.stopContainer(newContainerId); } catch {}
        try { await dockerService.removeContainer(newContainerId, true); } catch {}
        await projectRepo.updateStatus(slug, 'error');
        return reply.code(500).send({ error: `Rollback health check failed: ${healthErr.message}` });
      }

      // Swap proxy to the new port — zero downtime.
      await proxy.publishRoute({ slug, port: inactivePort, visibility: project.visibility, basicUser: project.basic_user, basicHash: project.basic_hash, apex: !!project.is_primary });
      await projectRepo.swapActiveSlot(slug);

      // Stop + remove the old container (no longer serving traffic).
      if (currentContainerId) {
        try { await dockerService.stopContainer(currentContainerId); } catch {}
        try { await dockerService.removeContainer(currentContainerId, true); } catch {}
      }

      // Swap current <-> previous so a subsequent rollback returns to the
      // version we just rolled away from.
      await projectRepo.updateRollback(slug, {
        containerId: newContainerId,
        imageId: targetImageId,
        previousContainerId: currentContainerId || null,
        previousImageId: currentImageId || null,
      });

      await auditRepo.appendAudit({ user_id: request.user.id, action: 'rollback', target: slug, ip: request.ip });

      return { project: pub(await projectRepo.findBySlug(slug)) };
    } catch (err) {
      request.log.error({ err }, '[projects] Rollback failed');
      await projectRepo.updateStatus(slug, 'error');
      return reply.code(500).send({ error: `Rollback failed: ${err.message}` });
    }
  });

  // Provision a dedicated Postgres database + least-privilege role for a system
  fastify.post('/api/projects/:slug/provision-db', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { features } = require('../util/flags');
    if (!features().dbProvisioning) return reply.code(404).send({ error: 'Database provisioning is not enabled.' });

    const { slug } = request.params;
    const project = await loadOr404(reply, slug);
    if (!project) return;

    const runner = require('../services/dbprovision-runner');
    const result = await runner.provision(slug);
    if (!result.ok) return reply.code(503).send({ error: result.reason });

    // Merge DATABASE_URL into the system's env (encrypted) for the next deploy.
    try {
      const env = require('./env');
      let vars = {};
      if (project.env_vars) { try { vars = env.decryptEnvVars(project.env_vars); } catch {} }
      vars.DATABASE_URL = result.url;
      await projectRepo.updateEnvVars(slug, env.encryptEnvVars(vars));
    } catch { /* env storage best-effort (e.g. ENV_SECRET unset) */ }

    await auditRepo.appendAudit({ user_id: request.user.id, action: 'db_provisioned', target: slug, detail: result.database, ip: request.ip });
    return { ok: true, database: result.database, user: result.user, databaseUrl: result.masked };
  });

  // Map a system to a GitHub repo + branch for deploy-on-push.
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
    const project = await loadOr404(reply, slug);
    if (!project) return;

    let repo = request.body.repo;
    if (repo != null) {
      repo = String(repo).trim();
      if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        return reply.code(400).send({ error: 'Repo must look like "owner/name".' });
      }
      if (!repo) repo = null;
    }
    const branch = (request.body.branch && String(request.body.branch).trim()) || project.deploy_branch || 'main';

    await projectRepo.updateRepo(slug, repo, branch);
    await auditRepo.appendAudit({ user_id: request.user.id, action: 'repo_set', target: slug, detail: repo ? `${repo}@${branch}` : 'cleared', ip: request.ip });
    return { project: pub(await projectRepo.findBySlug(slug)) };
  });

  // Designate (or clear) the PRIMARY system
  fastify.patch('/api/projects/:slug/primary', {
    preHandler: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['primary'], properties: { primary: { type: 'boolean' } } } },
  }, async (request, reply) => {
    const { slug } = request.params;
    const { primary } = request.body;
    const project = await loadOr404(reply, slug);
    if (!project) return;
    if (project.status === 'deleted') return reply.code(409).send({ error: 'System is deleted.' });
    if (primary && project.visibility === 'private') {
      return reply.code(400).send({ error: 'A private system has no public route to serve at the root domain. Make it public or password-protected first.' });
    }

    const errors = [];
    const republish = async (p, apex) => {
      try {
        await proxy.publishRoute({ slug: p.slug, port: p.port, visibility: p.visibility, basicUser: p.basic_user, basicHash: p.basic_hash, apex });
      } catch (e) { errors.push(`${p.slug}: ${e.message}`); }
    };

    if (primary) {
      const current = await projectRepo.findCurrentPrimary(slug);
      if (current) {
        await projectRepo.clearPrimary(current.id);
        await republish(current, false);
      }
      await projectRepo.setPrimary(slug);
      await republish({ ...project, is_primary: 1 }, true);
    } else {
      await projectRepo.clearPrimaryBySlug(slug);
      await republish(project, false);
    }

    await auditRepo.appendAudit({ user_id: request.user.id, action: 'primary_set', target: slug, detail: primary ? 'apex (root domain)' : 'cleared', ip: request.ip });
    return { project: pub(await projectRepo.findBySlug(slug)), warnings: errors.length ? errors : undefined };
  });

  // Last 10 deploy-history rows for a project.
  fastify.get('/api/projects/:slug/deploy-history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = await projectRepo.getProjectId(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const history = await projectRepo.getDeployHistory(project.id);

    return { history };
  });
}

module.exports = projectsRoutes;
