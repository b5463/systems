'use strict';

const path = require('path');
const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');
const { extractZip, detectProjectType, generateDockerfile } = require('../services/zip');
const { addProjectRoute, reloadNginx } = require('../services/nginx');

// In-memory build log buffers keyed by slug
const buildLogs = new Map();
const buildStatus = new Map();
const buildListeners = new Map();

// Slug: 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$|^[a-z0-9]{1,2}$/;

function isValidSlug(slug) {
  return SLUG_RE.test(slug);
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

    db.prepare(`
      UPDATE projects
      SET status = 'running', container_id = ?, image_id = ?, updated_at = datetime('now')
      WHERE slug = ?
    `).run(containerId, imageId, slug);

    appendBuildLog(slug, `[deploy] Configuring Nginx route /${slug}/...\n`);
    await addProjectRoute(slug, port);
    await reloadNginx();

    appendBuildLog(slug, `[deploy] Deployment complete. Available at /${slug}/\n`);
    auditLog({ user_id: userId, action: 'deploy', target: slug, detail: `port:${port}`, ip });
    finishBuild(slug, 'done');
  } catch (err) {
    appendBuildLog(slug, `[deploy] ERROR: ${err.message}\n`);
    finishBuild(slug, 'error');
    auditLog({ user_id: userId, action: 'deploy_fail', target: slug, detail: err.message, ip });
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

    // Remove old image after swap
    if (oldImageId && oldImageId !== newImageId) {
      try { await dockerService.removeImage(oldImageId, true); } catch (e) { /* in use elsewhere, ok */ }
    }

    appendBuildLog(slug, `[redeploy] Redeploy complete.\n`);
    auditLog({ user_id: userId, action: 'redeploy', target: slug, ip });
    finishBuild(slug, 'done');
  } catch (err) {
    appendBuildLog(slug, `[redeploy] ERROR: ${err.message}\n`);
    finishBuild(slug, 'error');
    auditLog({ user_id: userId, action: 'redeploy_fail', target: slug, detail: err.message, ip });
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

async function deployRoutes(fastify, options) {
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

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'name') name = part.value;
          else if (part.fieldname === 'slug') slug = part.value;
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

      if (!isValidSlug(slug)) {
        if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(400).send({
          error: 'Invalid slug: 2-50 lowercase alphanumeric chars and hyphens, no leading/trailing hyphens',
        });
      }

      if (!zipPath) {
        return reply.code(400).send({ error: 'Missing file upload' });
      }

      const existing = db.prepare('SELECT id FROM projects WHERE slug = ? OR name = ?').get(slug, name);
      if (existing) {
        await fsp.rm(zipPath, { force: true });
        return reply.code(409).send({ error: 'A project with this name or slug already exists' });
      }

      const dbPorts = db.prepare('SELECT port FROM projects WHERE port IS NOT NULL').all();
      const usedPorts = new Set(dbPorts.map((r) => r.port));
      const port = await dockerService.findFreePort(4000, 5000, usedPorts);

      db.prepare(`INSERT INTO projects (name, slug, port, status) VALUES (?, ?, ?, 'building')`).run(name, slug, port);
      const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);

      buildLogs.set(slug, []);
      buildStatus.set(slug, 'building');

      const capturedZip = zipPath;
      const capturedDir = extractDir;
      const userId = request.user.id;
      const ip = request.ip;

      setImmediate(() => {
        runBuildPipeline(slug, capturedZip, capturedDir, port, userId, ip).catch((err) => {
          console.error('[deploy] Unhandled pipeline error:', err);
        });
      });

      return reply.code(202).send({ project });
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

      if (!zipPath) {
        return reply.code(400).send({ error: 'Missing file upload' });
      }

      db.prepare(`UPDATE projects SET status = 'building', updated_at = datetime('now') WHERE slug = ?`).run(slug);

      buildLogs.set(slug, []);
      buildStatus.set(slug, 'building');

      const capturedZip = zipPath;
      const capturedDir = extractDir;
      const userId = request.user.id;
      const ip = request.ip;

      setImmediate(() => {
        runRedeployPipeline(slug, capturedZip, capturedDir, userId, ip).catch((err) => {
          console.error('[redeploy] Unhandled pipeline error:', err);
        });
      });

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
