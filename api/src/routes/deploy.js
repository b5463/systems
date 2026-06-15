'use strict';

const path = require('path');
const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');
const { extractZip, detectProjectType, generateDockerfile } = require('../services/zip');
const proxy = require('../services/proxy');
const notify = require('../services/notify');
const { slugError } = require('../util/slug');
const { features } = require('../util/flags');

// In-memory build log buffers keyed by slug
const buildLogs = new Map();
const buildStatus = new Map();
const buildListeners = new Map();

const RELEASE_RETENTION = () => Number(process.env.RELEASE_RETENTION_DEFAULT) || 3;

// Trim deploy_history rows beyond the retention count (metadata only — the
// rollback pointer lives on the project row and is never trimmed).
function pruneReleases(projectId) {
  try {
    db.prepare(`
      DELETE FROM deploy_history
      WHERE project_id = ? AND id NOT IN (
        SELECT id FROM deploy_history WHERE project_id = ? ORDER BY deployed_at DESC, id DESC LIMIT ?
      )
    `).run(projectId, projectId, RELEASE_RETENTION());
  } catch (e) { /* best-effort */ }
}

function appendBuildLog(slug, line) {
  if (!buildLogs.has(slug)) buildLogs.set(slug, []);
  buildLogs.get(slug).push(line);

  const listeners = buildListeners.get(slug);
  if (listeners) {
    for (const cb of listeners) cb(line);
  }
}

function finishBuild(slug, status) {
  buildStatus.set(slug, status);
  const listeners = buildListeners.get(slug);
  if (listeners) {
    for (const cb of listeners) cb(null, status);
    buildListeners.delete(slug);
  }
  setTimeout(() => {
    buildLogs.delete(slug);
    buildStatus.delete(slug);
  }, 5 * 60 * 1000);
}

async function runBuildPipeline(slug, zipPath, extractDir, port, userId, ip) {
  try {
    appendBuildLog(slug, `[deploy] Extracting zip...\n`);
    await extractZip(zipPath, extractDir);

    const projectType = await detectProjectType(extractDir);
    appendBuildLog(slug, `[deploy] Detected project type: ${projectType}\n`);

    // Dockerfile builds run project-defined instructions — advanced/admin-only
    // and OFF unless ENABLE_DOCKERFILE_MODE=true. Never run it silently.
    if (projectType === 'dockerfile' && !features().dockerfileMode) {
      throw new Error('This archive contains a Dockerfile. Dockerfile mode is disabled (set ENABLE_DOCKERFILE_MODE=true to allow it).');
    }

    if (projectType !== 'dockerfile') {
      appendBuildLog(slug, `[deploy] Generating Dockerfile for ${projectType} project...\n`);
      await generateDockerfile(projectType, extractDir);
    }

    appendBuildLog(slug, `[deploy] Building Docker image...\n`);
    const imageId = await dockerService.buildImage(slug, extractDir, (line) => {
      appendBuildLog(slug, line);
    });
    appendBuildLog(slug, `[deploy] Image built: ${imageId}\n`);

    appendBuildLog(slug, `[deploy] Starting container on port ${port}...\n`);
    const containerId = await dockerService.runContainer(slug, imageId, port);
    appendBuildLog(slug, `[deploy] Container started: ${containerId}\n`);

    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    const visibility = project?.visibility || 'public';

    db.prepare(`
      UPDATE projects
      SET status = 'running', container_id = ?, image_id = ?, deploy_type = ?, updated_at = datetime('now')
      WHERE slug = ?
    `).run(containerId, imageId, projectType, slug);

    // Publish the route per visibility (private => no public route).
    appendBuildLog(slug, `[deploy] Publishing ${visibility} route via ${proxy.kind()}...\n`);
    let published = false;
    try {
      const r = await proxy.publishRoute({ slug, port, visibility, basicUser: project?.basic_user, basicHash: project?.basic_hash, apex: !!project?.is_primary });
      published = r.published;
      if (r.reload && r.reload.ok === false && !['no_route', 'caddy_not_found'].includes(r.reload.reason)) {
        appendBuildLog(slug, `[deploy] WARNING: proxy reload reported: ${r.reload.reason}\n`);
      }
      appendBuildLog(slug, published ? `[deploy] Route published.\n` : `[deploy] No public route (private).\n`);
    } catch (e) {
      appendBuildLog(slug, `[deploy] WARNING: route publish failed: ${e.message}\n`);
    }
    db.prepare(`UPDATE projects SET route_published = ? WHERE slug = ?`).run(published ? 1 : 0, slug);
    if (project?.id) pruneReleases(project.id);

    appendBuildLog(slug, `[deploy] Deployment complete.\n`);
    auditLog({ user_id: userId, action: 'deploy', target: slug, detail: `port:${port} ${visibility}`, ip });
    notify.send({ kind: 'deploy', slug, detail: 'deployed' }).catch(() => {});
    finishBuild(slug, 'done');
  } catch (err) {
    appendBuildLog(slug, `[deploy] ERROR: ${err.message}\n`);
    finishBuild(slug, 'error');
    auditLog({ user_id: userId, action: 'deploy_fail', target: slug, detail: err.message, ip });
    notify.send({ kind: 'deploy_failed', slug, detail: err.message }).catch(() => {});
    try {
      db.prepare(`UPDATE projects SET status = 'error', updated_at = datetime('now') WHERE slug = ?`).run(slug);
    } catch (dbErr) {
      console.error('[deploy] Failed to update status to error:', dbErr);
    }
  } finally {
    try {
      await fsp.rm(zipPath, { force: true });
      await fsp.rm(extractDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('[deploy] Failed to clean up temp files:', cleanupErr);
    }
  }
}

async function runRedeployPipeline(slug, zipPath, extractDir, userId, ip) {
  const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
  const oldContainerId = project.container_id;
  const oldImageId = project.image_id;
  const port = project.port;

  try {
    appendBuildLog(slug, `[redeploy] Extracting zip...\n`);
    await extractZip(zipPath, extractDir);

    const projectType = await detectProjectType(extractDir);
    appendBuildLog(slug, `[redeploy] Detected project type: ${projectType}\n`);

    if (projectType !== 'dockerfile') {
      await generateDockerfile(projectType, extractDir);
    }

    // Snapshot the current deploy so it can be rolled back to. We record this
    // BEFORE building the new image so the project always points at a known-good
    // previous image/container.
    db.prepare(`
      UPDATE projects
      SET previous_container_id = ?, previous_image_id = ?
      WHERE slug = ?
    `).run(oldContainerId || null, oldImageId || null, slug);

    try {
      db.prepare(`
        INSERT INTO deploy_history (project_id, image_id, container_id)
        VALUES (?, ?, ?)
      `).run(project.id, oldImageId || null, oldContainerId || null);
    } catch (e) {
      console.error('[redeploy] Failed to record deploy history:', e);
    }

    appendBuildLog(slug, `[redeploy] Building new Docker image...\n`);
    const newImageId = await dockerService.buildImage(slug, extractDir, (line) => {
      appendBuildLog(slug, line);
    });
    appendBuildLog(slug, `[redeploy] Image built: ${newImageId}\n`);

    // Atomic swap: stop old → remove old → start new
    appendBuildLog(slug, `[redeploy] Stopping old container...\n`);
    if (oldContainerId) {
      try { await dockerService.stopContainer(oldContainerId); } catch (e) { /* already stopped */ }
      try { await dockerService.removeContainer(oldContainerId, true); } catch (e) { /* gone */ }
    }

    appendBuildLog(slug, `[redeploy] Starting new container on port ${port}...\n`);

    // Carry over existing env vars
    let envVars = {};
    if (project.env_vars) {
      try {
        const { decryptEnvVars } = require('./env');
        envVars = decryptEnvVars(project.env_vars);
      } catch (e) {
        appendBuildLog(slug, `[redeploy] Warning: could not decrypt env vars, starting without them\n`);
      }
    }

    const newContainerId = await dockerService.runContainer(slug, newImageId, port, envVars);
    appendBuildLog(slug, `[redeploy] Container started: ${newContainerId}\n`);

    db.prepare(`
      UPDATE projects
      SET status = 'running', container_id = ?, image_id = ?, updated_at = datetime('now')
      WHERE slug = ?
    `).run(newContainerId, newImageId, slug);

    // Keep the old image for rollback — do NOT remove it on redeploy.
    // (Previously: dockerService.removeImage(oldImageId, true).)

    appendBuildLog(slug, `[redeploy] Redeploy complete.\n`);
    auditLog({ user_id: userId, action: 'redeploy', target: slug, ip });
    notify.send({ kind: 'redeploy', slug, detail: 'redeployed' }).catch(() => {});
    finishBuild(slug, 'done');
  } catch (err) {
    appendBuildLog(slug, `[redeploy] ERROR: ${err.message}\n`);
    finishBuild(slug, 'error');
    auditLog({ user_id: userId, action: 'redeploy_fail', target: slug, detail: err.message, ip });
    notify.send({ kind: 'deploy_failed', slug, detail: err.message }).catch(() => {});
    try {
      db.prepare(`UPDATE projects SET status = 'error', updated_at = datetime('now') WHERE slug = ?`).run(slug);
    } catch (dbErr) {
      console.error('[redeploy] Failed to update status to error:', dbErr);
    }
  } finally {
    try {
      await fsp.rm(zipPath, { force: true });
      await fsp.rm(extractDir, { recursive: true, force: true });
    } catch (e) {
      console.error('[redeploy] Failed to clean up temp files:', e);
    }
  }
}

// Validate + create a new project row and kick the build pipeline. Shared by
// the multipart /api/deploy endpoint and the chunked-upload completion path so
// every entry point runs identical validation and the same pipeline.
async function beginDeploy({ name, slug, visibility = 'public', zipPath, userId, ip }) {
  if (!name || !slug) return { ok: false, code: 400, error: 'Missing required fields: name, slug' };
  const slugErr = slugError(slug);
  if (slugErr) return { ok: false, code: 400, error: slugErr };
  if (!zipPath) return { ok: false, code: 400, error: 'Missing file upload' };
  if (!['public', 'private'].includes(visibility)) visibility = 'public';

  const existing = db.prepare('SELECT id FROM projects WHERE slug = ? OR name = ?').get(slug, name);
  if (existing) return { ok: false, code: 409, error: 'A project with this name or slug already exists' };

  const dbPorts = db.prepare('SELECT port FROM projects WHERE port IS NOT NULL').all();
  const usedPorts = new Set(dbPorts.map((r) => r.port));
  const port = await dockerService.findFreePort(4000, 5000, usedPorts);

  db.prepare(`INSERT INTO projects (name, slug, port, status, visibility) VALUES (?, ?, ?, 'building', ?)`).run(name, slug, port, visibility);
  const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);

  buildLogs.set(slug, []);
  buildStatus.set(slug, 'building');

  const extractDir = `/tmp/${uuidv4()}`;
  setImmediate(() => {
    runBuildPipeline(slug, zipPath, extractDir, port, userId, ip).catch((err) => {
      console.error('[deploy] Unhandled pipeline error:', err);
    });
  });
  return { ok: true, project: pub(project) };
}

// Kick a redeploy of an existing system from an already-saved zip. Shared by
// the multipart redeploy endpoint and the GitHub push handler.
async function beginRedeploy({ slug, zipPath, userId, ip }) {
  const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
  if (!project) return { ok: false, code: 404, error: 'Project not found' };
  if (project.status === 'building') return { ok: false, code: 409, error: 'Build already in progress' };
  if (!zipPath) return { ok: false, code: 400, error: 'Missing file upload' };

  db.prepare(`UPDATE projects SET status = 'building', updated_at = datetime('now') WHERE slug = ?`).run(slug);
  buildLogs.set(slug, []);
  buildStatus.set(slug, 'building');

  const extractDir = `/tmp/${uuidv4()}`;
  setImmediate(() => {
    runRedeployPipeline(slug, zipPath, extractDir, userId, ip).catch((err) => {
      console.error('[redeploy] Unhandled pipeline error:', err);
    });
  });
  return { ok: true, slug };
}

// Sanitize a project row for client return (drop the basic-auth hash).
function pub(p) { if (p) delete p.basic_hash; return p; }

async function deployRoutes(fastify, options) {
  // Dry-run plan: validate the slug and show exactly what WOULD happen —
  // planned container name, public host, generated Caddy route file and the
  // lifecycle — without touching Docker or Caddy. Safe to call freely.
  fastify.post('/api/deploy/plan', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['slug'],
        properties: {
          slug: { type: 'string' },
          visibility: { type: 'string', enum: ['public', 'private', 'password'] },
        },
      },
    },
  }, async (request) => {
    const caddy = require('../services/caddy');
    const { slug } = request.body;
    const visibility = request.body.visibility || 'public';
    const err = slugError(slug);
    const taken = !err && !!db.prepare('SELECT 1 FROM projects WHERE slug = ? AND status != ?').get(slug, 'deleted');

    const plan = {
      slug,
      valid: !err && !taken,
      error: err || (taken ? 'A system with this slug already exists.' : null),
      proxy: proxy.kind(),
      host: `${slug}.${process.env.BASE_DOMAIN || 'acronym.sk'}`,
      containerName: `systems-${slug}`,
      visibility,
      routePublished: visibility !== 'private',
      route: visibility === 'private' ? null
        : caddy.renderRoute({ slug, port: 3000, visibility: visibility === 'password' ? 'public' : visibility }),
      lifecycle: ['archive', 'detect', 'install', 'build', 'container', 'route', 'HTTPS', 'health', 'live'],
    };
    return { plan };
  });

  // Initial deploy
  fastify.post('/api/deploy', {
    preHandler: [fastify.authenticate],
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    let zipPath = null;
    let extractDir = null;

    try {
      const parts = request.parts();
      let name = null;
      let slug = null;
      let visibility = 'public';

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'name') name = part.value;
          else if (part.fieldname === 'slug') slug = part.value;
          else if (part.fieldname === 'visibility' && ['public', 'private'].includes(part.value)) visibility = part.value;
        } else if (part.type === 'file' && part.fieldname === 'file') {
          const uuid = uuidv4();
          zipPath = `/tmp/${uuid}.zip`;
          extractDir = `/tmp/${uuid}`;

          const chunks = [];
          let totalSize = 0;
          for await (const chunk of part.file) {
            totalSize += chunk.length;
            if (totalSize > 500 * 1024 * 1024) {
              await part.file.resume();
              if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
              return reply.code(413).send({ error: 'ZIP file exceeds 500MB limit' });
            }
            chunks.push(chunk);
          }
          await fsp.writeFile(zipPath, Buffer.concat(chunks));
        } else if (part.file) {
          await part.file.resume();
        }
      }

      if (!name || !slug) {
        if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(400).send({ error: 'Missing required fields: name, slug' });
      }

      const slugErr = slugError(slug);
      if (slugErr) {
        if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(400).send({ error: slugErr });
      }

      if (!zipPath) {
        return reply.code(400).send({ error: 'Missing file upload' });
      }

      const result = await beginDeploy({ name, slug, visibility, zipPath, userId: request.user.id, ip: request.ip });
      if (!result.ok) {
        if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(result.code).send({ error: result.error });
      }
      return reply.code(202).send({ project: result.project });
    } catch (err) {
      if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
      if (extractDir) await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });

  // Redeploy existing project with a new ZIP
  fastify.post('/api/deploy/:slug/redeploy', {
    preHandler: [fastify.authenticate],
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const { slug } = request.params;
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (project.status === 'building') return reply.code(409).send({ error: 'Build already in progress' });

    let zipPath = null;
    let extractDir = null;

    try {
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          const uuid = uuidv4();
          zipPath = `/tmp/${uuid}.zip`;
          extractDir = `/tmp/${uuid}`;

          const chunks = [];
          let totalSize = 0;
          for await (const chunk of part.file) {
            totalSize += chunk.length;
            if (totalSize > 500 * 1024 * 1024) {
              await part.file.resume();
              if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
              return reply.code(413).send({ error: 'ZIP file exceeds 500MB limit' });
            }
            chunks.push(chunk);
          }
          await fsp.writeFile(zipPath, Buffer.concat(chunks));
        } else if (part.file) {
          await part.file.resume();
        }
      }

      const result = await beginRedeploy({ slug, zipPath, userId: request.user.id, ip: request.ip });
      if (!result.ok) {
        if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(result.code).send({ error: result.error });
      }
      return reply.code(202).send({ message: 'Redeploy started', slug });
    } catch (err) {
      if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
      if (extractDir) await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });

  // WebSocket: stream build log
  fastify.get('/api/deploy/:slug/build-log', {
    websocket: true,
    preHandler: [fastify.authenticate],
  }, (socket, request) => {
    const { slug } = request.params;
    const logs = buildLogs.get(slug) || [];
    const status = buildStatus.get(slug);

    for (const line of logs) {
      socket.send(JSON.stringify({ type: 'log', data: line }));
    }

    if (status === 'done' || status === 'error') {
      socket.send(JSON.stringify({ type: 'status', status }));
      socket.close();
      return;
    }

    if (!buildListeners.has(slug)) buildListeners.set(slug, new Set());

    const listener = (line, finalStatus) => {
      if (socket.readyState !== socket.OPEN) return;
      if (line === null) {
        socket.send(JSON.stringify({ type: 'status', status: finalStatus }));
        socket.close();
      } else {
        socket.send(JSON.stringify({ type: 'log', data: line }));
      }
    };

    buildListeners.get(slug).add(listener);

    socket.on('close', () => {
      const ls = buildListeners.get(slug);
      if (ls) ls.delete(listener);
    });

    socket.on('error', () => {
      const ls = buildListeners.get(slug);
      if (ls) ls.delete(listener);
    });
  });
}

module.exports = deployRoutes;
module.exports.beginDeploy = beginDeploy;
module.exports.beginRedeploy = beginRedeploy;
