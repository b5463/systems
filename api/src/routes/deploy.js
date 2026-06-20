'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { db, auditLog } = require('../db');
const dockerService = require('../services/docker');
const { projectContainerOptions } = require('../util/limits');
const { extractZip, detectProjectType, generateDockerfile } = require('../services/zip');
const proxy = require('../services/proxy');
const notify = require('../services/notify');
const health = require('../services/health');
const { slugError } = require('../util/slug');
const { pub } = require('../util/project');
const { MAX_MULTIPART_BYTES } = require('../util/upload');
const { tmpZip, tmpDir } = require('../util/tmp');
const { features } = require('../util/flags');
const { BuildGate } = require('../util/build');

// In-memory build log buffers keyed by slug
const buildLogs = new Map();
const buildStatus = new Map();
const buildListeners = new Map();
const buildGate = new BuildGate();

const { getSetting } = require('../util/settings');
const RELEASE_RETENTION = () => getSetting('releaseRetention');

// Serialize the port-allocation + INSERT critical section across concurrent
// deploys (an in-process promise chain).
let deployLock = Promise.resolve();
function withDeployLock(fn) {
  const run = deployLock.then(fn, fn);
  deployLock = run.then(() => {}, () => {});
  return run;
}

// Stream a multipart upload to a temp .zip, capturing string fields. Enforces
// the transport cap. Shared by the deploy + redeploy endpoints.
// Returns { zipPath, fields, tooLarge }.
async function readUploadToTmp(request) {
  const fields = {};
  let zipPath = null;
  let tooLarge = false;
  for await (const part of request.parts()) {
    if (part.type === 'field') {
      fields[part.fieldname] = part.value;
    } else if (part.type === 'file' && part.fieldname === 'file') {
      zipPath = tmpZip();
      const chunks = [];
      let total = 0;
      for await (const chunk of part.file) {
        total += chunk.length;
        if (total > MAX_MULTIPART_BYTES) { await part.file.resume(); tooLarge = true; break; }
        chunks.push(chunk);
      }
      if (!tooLarge) await fsp.writeFile(zipPath, Buffer.concat(chunks));
    } else if (part.file) {
      await part.file.resume();
    }
  }
  if (tooLarge && zipPath) { await fsp.rm(zipPath, { force: true }).catch(() => {}); zipPath = null; }
  return { zipPath, fields, tooLarge };
}

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
  const cleanupTimer = setTimeout(() => {
    buildLogs.delete(slug);
    buildStatus.delete(slug);
  }, 5 * 60 * 1000);
  // Build-log retention must not keep short-lived tools/tests alive.
  cleanupTimer.unref?.();
}

// Per-stage failure context: a human-readable label and a concrete next step.
// Keyed by the pipeline stage that was in progress when the error was thrown.
const STAGE_INFO = {
  extract: { label: 'extracting the archive', hint: 'The archive may be corrupt or empty. Re-export the .zip and redeploy.' },
  detect: { label: 'detecting the project type', hint: 'Make sure your project files are at the root of the archive (index.html, package.json, requirements.txt, or a Dockerfile).' },
  build: { label: 'building the image', hint: 'Check the build log above for the failing step (dependency install, compile, or Dockerfile error), fix it, and redeploy.' },
  container: { label: 'starting the container', hint: 'The image built but the container did not start — check the runtime logs for the crash reason, then redeploy.' },
  deploy: { label: 'deploying', hint: 'Check the log above and redeploy.' },
};

function recentLogExcerpt(slug) {
  const lines = buildLogs.get(slug) || [];
  return lines
    .join('')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(-12)
    .join('\n')
    .slice(0, 2000);
}

// Record a deploy/redeploy failure with the failing stage, a clear log message,
// a recovery hint, an audit entry, a notification, and a persisted last_error so
// the dashboard can show *what* failed rather than a bare "error".
function failBuild({ slug, stage, err, userId, ip, tag = 'deploy' }) {
  const info = STAGE_INFO[stage] || { label: stage || 'deploying', hint: '' };
  const reason = `Failed while ${info.label}: ${err.message}`;
  appendBuildLog(slug, `\n[${tag}] FAILED while ${info.label}: ${err.message}\n`);
  if (info.hint) appendBuildLog(slug, `[${tag}] Next step: ${info.hint}\n`);
  finishBuild(slug, 'error');
  auditLog({ user_id: userId, action: `${tag}_fail`, target: slug, detail: `${stage}: ${err.message}`.slice(0, 300), ip });
  notify.send({ kind: 'deploy_failed', slug, detail: reason }).catch(() => {});
  try {
    db.prepare(`UPDATE projects SET github_deploy_status = 'failed', github_deploy_detail = ?, github_deploy_at = datetime('now') WHERE slug = ? AND github_deploy_status = 'building'`)
      .run(reason.slice(0, 500), slug);
    db.prepare(`UPDATE projects SET status = 'error', last_error = ?, last_error_stage = ?, last_error_hint = ?, last_error_excerpt = ?, updated_at = datetime('now') WHERE slug = ?`)
      .run(reason.slice(0, 500), stage || null, info.hint || null, recentLogExcerpt(slug), slug);
  } catch (dbErr) {
    console.error(`[${tag}] Failed to update status to error:`, dbErr);
  }
}

async function findProjectRoot(dirPath) {
  const entries = await fsp.readdir(dirPath);
  if (entries.length === 1) {
    const only = path.join(dirPath, entries[0]);
    try {
      if ((await fsp.stat(only)).isDirectory()) return only;
    } catch { /* ignore */ }
  }
  return dirPath;
}

async function fileExists(root, name) {
  try {
    await fsp.access(path.join(root, name));
    return true;
  } catch {
    return false;
  }
}

async function analyzeArchive(zipPath) {
  const extractDir = tmpDir();
  try {
    const extracted = await extractZip(zipPath, extractDir);
    const root = await findProjectRoot(extractDir);
    const rootFiles = await fsp.readdir(root);
    const lower = new Set(rootFiles.map((f) => f.toLowerCase()));
    const projectType = await detectProjectType(extractDir);
    const evidence = [];
    const warnings = [];
    const blockers = [];
    const result = {
      projectType,
      entryPoint: null,
      buildCommand: null,
      outputFolder: null,
      expectedPort: 3000,
      filesUsed: evidence,
      warnings,
      blockers,
      rootFolder: path.relative(extractDir, root) || '.',
      fileCount: extracted.length,
    };

    for (const name of ['Dockerfile', 'package.json', 'requirements.txt', 'pyproject.toml', 'index.html', 'vite.config.js', 'vite.config.ts']) {
      if (lower.has(name.toLowerCase())) evidence.push(name);
    }

    if (projectType === 'node' && await fileExists(root, 'package.json')) {
      const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));
      const scripts = pkg.scripts || {};
      result.entryPoint = pkg.main || (scripts.start ? 'npm start' : null);
      result.buildCommand = scripts.build ? 'npm run build' : (scripts.start ? 'npm start' : null);
      result.outputFolder = lower.has('vite.config.js') || lower.has('vite.config.ts') ? 'dist' : null;
      if (!scripts.start && !scripts.build) warnings.push('package.json has no start or build script.');
      evidence.push('package.json scripts');
    } else if (projectType === 'python') {
      result.entryPoint = lower.has('app.py') ? 'app.py' : (lower.has('main.py') ? 'main.py' : 'main.py (expected)');
      result.buildCommand = lower.has('requirements.txt') ? 'pip install -r requirements.txt' : 'No requirements install';
      if (!lower.has('app.py') && !lower.has('main.py')) warnings.push('No app.py or main.py found at the archive root.');
    } else if (projectType === 'static') {
      result.entryPoint = lower.has('index.html') ? 'index.html' : null;
      result.outputFolder = '.';
      result.buildCommand = 'No build command; served by nginx';
      if (!lower.has('index.html')) blockers.push('Static archives need index.html at the detected root.');
    } else if (projectType === 'dockerfile') {
      result.entryPoint = 'Dockerfile';
      result.buildCommand = 'docker build';
      if (!features().dockerfileMode) blockers.push('Dockerfile mode is disabled. Set ENABLE_DOCKERFILE_MODE=true to allow it.');
    }

    return result;
  } finally {
    await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }
}

// After a deploy, probe real health (detached — never delays the "done" signal)
// so the dashboard reflects the running app instead of a stale/false status.
// Retries briefly while the container boots.
function probeHealthSoon(slug) {
  (async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 800 : 2000));
      const fresh = db.prepare('SELECT slug, port, route_published, health_path FROM projects WHERE slug = ?').get(slug);
      if (!fresh) return;
      const target = health.targetFor(fresh);
      if (!target) return;
      try {
        const hr = await health.checkSystem(target, fresh.health_path || '/');
        const routeAttestation = fresh.route_published && !health.isLocalMode()
          ? await health.checkAttestation(target, slug)
          : { state: 'not_applicable', checkedAt: new Date().toISOString() };
        db.prepare('UPDATE projects SET health_state = ?, health_status = ?, health_response_ms = ?, health_checked_at = ?, attestation_state = ?, attestation_checked_at = ? WHERE slug = ?')
          .run(hr.state, hr.httpStatus, hr.responseMs, hr.checkedAt, routeAttestation.state, routeAttestation.checkedAt, slug);
        db.prepare(`UPDATE projects SET health_failures = CASE WHEN ? = 'healthy' THEN 0 ELSE health_failures + 1 END WHERE slug = ?`)
          .run(hr.state, slug);
        if (hr.state === 'healthy') return;
      } catch { /* keep trying */ }
    }
  })().catch(() => {});
}

async function runBuildPipeline(slug, zipPath, extractDir, port, userId, ip, envVars = {}) {
  let stage = 'extract';
  try {
    appendBuildLog(slug, `[deploy] Extracting zip...\n`);
    await extractZip(zipPath, extractDir);

    stage = 'detect';
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

    stage = 'build';
    appendBuildLog(slug, `[deploy] Building Docker image...\n`);
    const imageId = await dockerService.buildImage(slug, extractDir, (line) => {
      appendBuildLog(slug, line);
    });
    appendBuildLog(slug, `[deploy] Image built: ${imageId}\n`);

    stage = 'container';
    const containerPort = (await dockerService.imageExposedPort(imageId)) || 3000;
    appendBuildLog(slug, `[deploy] Starting container — host ${port} → container ${containerPort}...\n`);
    const runtimeProject = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    const containerId = await dockerService.runContainer(
      slug, imageId, port, envVars, projectContainerOptions(runtimeProject, { containerPort })
    );
    appendBuildLog(slug, `[deploy] Container started: ${containerId}\n`);

    stage = 'route';
    const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
    const visibility = project?.visibility || 'public';

    db.prepare(`
      UPDATE projects
      SET status = 'running', container_id = ?, image_id = ?, deploy_type = ?, last_error = NULL,
          last_error_stage = NULL, last_error_hint = NULL, last_error_excerpt = NULL,
          updated_at = datetime('now')
      WHERE slug = ?
    `).run(containerId, imageId, projectType, slug);

    // Publish the route per visibility (private => no public route).
    appendBuildLog(slug, `[deploy] Publishing ${visibility} route via ${proxy.kind()}...\n`);
    let published = false;
    try {
      const r = await proxy.publishRoute({ slug, port, visibility, basicUser: project?.basic_user, basicHash: project?.basic_hash, apex: !!project?.is_primary });
      published = r.published;
      // "no proxy on this host" is an expected local/dev condition, not a warning.
      const benign = ['no_route', 'caddy_not_found', 'nginx_not_found', 'conf_dir_missing'];
      if (r.reload && r.reload.ok === false && !benign.includes(r.reload.reason)) {
        appendBuildLog(slug, `[deploy] WARNING: proxy reload reported: ${r.reload.reason}\n`);
      }
      if (published) {
        appendBuildLog(slug, `[deploy] Route published.\n`);
      } else if (visibility === 'private') {
        appendBuildLog(slug, `[deploy] No public route (private system).\n`);
      } else {
        appendBuildLog(slug, `[deploy] No public route — reverse proxy not available on this host. The system is running and reachable on its host port (${port}).\n`);
      }
    } catch (e) {
      appendBuildLog(slug, `[deploy] WARNING: route publish failed: ${e.message}\n`);
    }
    db.prepare(`UPDATE projects SET route_published = ? WHERE slug = ?`).run(published ? 1 : 0, slug);
    if (project?.id) pruneReleases(project.id);

    appendBuildLog(slug, `[deploy] Deployment complete.\n`);
    auditLog({ user_id: userId, action: 'deploy', target: slug, detail: `port:${port} ${visibility}`, ip });
    notify.send({ kind: 'deploy', slug, detail: 'deployed' }).catch(() => {});
    finishBuild(slug, 'done');
    probeHealthSoon(slug);
  } catch (err) {
    failBuild({ slug, stage, err, userId, ip, tag: 'deploy' });
  } finally {
    buildGate.release(slug);
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

  let stage = 'extract';
  try {
    appendBuildLog(slug, `[redeploy] Extracting zip...\n`);
    await extractZip(zipPath, extractDir);

    stage = 'detect';
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

    stage = 'build';
    appendBuildLog(slug, `[redeploy] Building new Docker image...\n`);
    const newImageId = await dockerService.buildImage(slug, extractDir, (line) => {
      appendBuildLog(slug, line);
    });
    appendBuildLog(slug, `[redeploy] Image built: ${newImageId}\n`);

    stage = 'container';
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

    const containerPort = (await dockerService.imageExposedPort(newImageId)) || 3000;
    appendBuildLog(slug, `[redeploy] Starting new container — host ${port} → container ${containerPort}...\n`);
    const newContainerId = await dockerService.runContainer(
      slug, newImageId, port, envVars, projectContainerOptions(project, { containerPort })
    );
    appendBuildLog(slug, `[redeploy] Container started: ${newContainerId}\n`);

    db.prepare(`
      UPDATE projects
      SET status = 'running', container_id = ?, image_id = ?, last_error = NULL,
          last_error_stage = NULL, last_error_hint = NULL, last_error_excerpt = NULL,
          updated_at = datetime('now')
      WHERE slug = ?
    `).run(newContainerId, newImageId, slug);

    // Keep the old image for rollback — do NOT remove it on redeploy.
    // (Previously: dockerService.removeImage(oldImageId, true).)

    appendBuildLog(slug, `[redeploy] Redeploy complete.\n`);
    db.prepare(`UPDATE projects SET github_deploy_status = 'succeeded', github_deploy_detail = 'Deployment completed', github_deploy_at = datetime('now') WHERE slug = ? AND github_deploy_status = 'building'`).run(slug);
    auditLog({ user_id: userId, action: 'redeploy', target: slug, ip });
    notify.send({ kind: 'redeploy', slug, detail: 'redeployed' }).catch(() => {});
    finishBuild(slug, 'done');
    probeHealthSoon(slug);
  } catch (err) {
    failBuild({ slug, stage, err, userId, ip, tag: 'redeploy' });
  } finally {
    buildGate.release(slug);
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
async function beginDeploy({ name, slug, visibility = 'public', zipPath, userId, ip, envVars = {} }) {
  if (!name || !slug) return { ok: false, code: 400, error: 'Missing required fields: name, slug' };
  const slugErr = slugError(slug);
  if (slugErr) return { ok: false, code: 400, error: slugErr };
  if (!zipPath) return { ok: false, code: 400, error: 'Missing file upload' };
  if (!['public', 'private'].includes(visibility)) visibility = 'public';

  const existing = db.prepare('SELECT id FROM projects WHERE slug = ? OR name = ?').get(slug, name);
  if (existing) return { ok: false, code: 409, error: 'A project with this name or slug already exists' };
  if (!buildGate.tryAcquire(slug)) {
    return { ok: false, code: 429, error: 'Build capacity is full. Wait for the active build to finish and try again.' };
  }

  let handedOff = false;
  try {
    // Serialize port allocation + INSERT so concurrent deploys cannot claim the
    // same host port. Build concurrency is controlled separately by buildGate.
    let port, project, conflict;
    await withDeployLock(async () => {
      if (db.prepare('SELECT id FROM projects WHERE slug = ? OR name = ?').get(slug, name)) { conflict = true; return; }
      const dbPorts = db.prepare('SELECT port FROM projects WHERE port IS NOT NULL').all();
      const usedPorts = new Set(dbPorts.map((r) => r.port));
      port = await dockerService.findFreePort(4000, 5000, usedPorts);
      db.prepare(`INSERT INTO projects (name, slug, port, status, visibility) VALUES (?, ?, ?, 'building', ?)`).run(name, slug, port, visibility);
      project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);

      if (Object.keys(envVars).length > 0 && process.env.ENV_SECRET) {
        try {
          const { encryptEnvVars } = require('./env');
          const encrypted = encryptEnvVars(envVars);
          db.prepare('UPDATE projects SET env_vars = ? WHERE slug = ?').run(encrypted, slug);
        } catch (e) {
          console.error('[deploy] Failed to save env vars:', e);
        }
      }
    });
    if (conflict) return { ok: false, code: 409, error: 'A project with this name or slug already exists' };

    buildLogs.set(slug, []);
    buildStatus.set(slug, 'building');
    const extractDir = tmpDir();
    setImmediate(() => {
      runBuildPipeline(slug, zipPath, extractDir, port, userId, ip, envVars).catch((err) => {
        console.error('[deploy] Unhandled pipeline error:', err);
      });
    });
    handedOff = true;
    return { ok: true, project: pub(project) };
  } catch (err) {
    if (dockerService.isDockerUnavailableError(err)) {
      return { ok: false, code: 503, error: 'Docker is not reachable. Start Docker and try again.' };
    }
    throw err;
  } finally {
    if (!handedOff) buildGate.release(slug);
  }
}

// Kick a redeploy of an existing system from an already-saved zip. Shared by
// the multipart redeploy endpoint and the GitHub push handler.
async function beginRedeploy({ slug, zipPath, userId, ip }) {
  const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
  if (!project) return { ok: false, code: 404, error: 'Project not found' };
  if (project.status === 'building') return { ok: false, code: 409, error: 'Build already in progress' };
  if (!zipPath) return { ok: false, code: 400, error: 'Missing file upload' };
  if (!buildGate.tryAcquire(slug)) {
    return { ok: false, code: 429, error: 'Build capacity is full. Wait for the active build to finish and try again.' };
  }

  let handedOff = false;
  try {
    db.prepare(`UPDATE projects SET status = 'building', updated_at = datetime('now') WHERE slug = ?`).run(slug);
    buildLogs.set(slug, []);
    buildStatus.set(slug, 'building');

    const extractDir = tmpDir();
    setImmediate(() => {
      runRedeployPipeline(slug, zipPath, extractDir, userId, ip).catch((err) => {
        console.error('[redeploy] Unhandled pipeline error:', err);
      });
    });
    handedOff = true;
    return { ok: true, slug };
  } catch (err) {
    db.prepare("UPDATE projects SET status = ?, updated_at = datetime('now') WHERE slug = ?").run(project.status, slug);
    throw err;
  } finally {
    if (!handedOff) buildGate.release(slug);
  }
}
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
      containerName: `deploy_${slug}`,
      visibility,
      routePublished: visibility !== 'private',
      route: visibility === 'private' ? null
        : caddy.renderRoute({ slug, port: 3000, visibility: visibility === 'password' ? 'public' : visibility }),
      lifecycle: ['archive', 'detect', 'install', 'build', 'container', 'route', 'HTTPS', 'health', 'live'],
    };
    return { plan };
  });

  fastify.post('/api/deploy/analyze', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    let zipPath = null;
    try {
      const up = await readUploadToTmp(request);
      zipPath = up.zipPath;
      if (up.tooLarge) return reply.code(413).send({ error: `ZIP exceeds the ${MAX_MULTIPART_BYTES / 1048576}MB limit` });
      if (!zipPath) return reply.code(400).send({ error: 'Missing file upload' });
      const analysis = await analyzeArchive(zipPath);
      return { analysis };
    } finally {
      if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
    }
  });

  // Initial deploy
  fastify.post('/api/deploy', {
    preHandler: [fastify.authenticate],
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    let zipPath = null;
    try {
      const up = await readUploadToTmp(request);
      zipPath = up.zipPath;
      if (up.tooLarge) return reply.code(413).send({ error: `ZIP exceeds the ${MAX_MULTIPART_BYTES / 1048576}MB limit` });

      const visibility = ['public', 'private'].includes(up.fields.visibility) ? up.fields.visibility : 'public';
      let envVars = {};
      if (up.fields.envVars) {
        try {
          const parsed = JSON.parse(up.fields.envVars);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) envVars = parsed;
        } catch { /* ignore malformed */ }
      }
      const result = await beginDeploy({
        name: up.fields.name, slug: up.fields.slug, visibility, zipPath,
        userId: request.user.id, ip: request.ip, envVars,
      });
      if (!result.ok) {
        if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(result.code).send({ error: result.error });
      }
      return reply.code(202).send({ project: result.project });
    } catch (err) {
      if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
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
    try {
      const up = await readUploadToTmp(request);
      zipPath = up.zipPath;
      if (up.tooLarge) return reply.code(413).send({ error: `ZIP exceeds the ${MAX_MULTIPART_BYTES / 1048576}MB limit` });

      const result = await beginRedeploy({ slug, zipPath, userId: request.user.id, ip: request.ip });
      if (!result.ok) {
        if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(result.code).send({ error: result.error });
      }
      return reply.code(202).send({ message: 'Redeploy started', slug });
    } catch (err) {
      if (zipPath) await fsp.rm(zipPath, { force: true }).catch(() => {});
      throw err;
    }
  });

  // WebSocket: stream build log
  fastify.get('/api/deploy/:slug/build-log', {
    websocket: true,
    preHandler: [fastify.authenticate],
  }, (connection, request) => {
    // @fastify/websocket v8 passes a { socket } wrapper; newer majors pass the
    // socket directly. Support both so the handler body is version-agnostic.
    const socket = connection.socket || connection;
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
