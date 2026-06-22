'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { projectRepo, auditRepo } = require('../repo');
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
async function pruneReleases(projectId) {
  try {
    await projectRepo.pruneDeployHistory(projectId, RELEASE_RETENTION());
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
  health_gate: { label: 'health-checking the new container', hint: 'The new container started but did not pass health checks. The previous version is still running. Check the application logs for startup errors, then redeploy.' },
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
async function failBuild({ slug, stage, err, userId, ip, tag = 'deploy' }) {
  const info = STAGE_INFO[stage] || { label: stage || 'deploying', hint: '' };
  const reason = `Failed while ${info.label}: ${err.message}`;
  appendBuildLog(slug, `\n[${tag}] FAILED while ${info.label}: ${err.message}\n`);
  if (info.hint) appendBuildLog(slug, `[${tag}] Next step: ${info.hint}\n`);
  finishBuild(slug, 'error');
  await auditRepo.appendAudit({ user_id: userId, action: `${tag}_fail`, target: slug, detail: `${stage}: ${err.message}`.slice(0, 300), ip });
  notify.send({ kind: 'deploy_failed', slug, detail: reason }).catch(() => {});
  try {
    await projectRepo.updateGithubDeployFailed(slug, reason.slice(0, 500));
    await projectRepo.updateError(slug, { lastError: reason.slice(0, 500), lastErrorStage: stage || null, lastErrorHint: info.hint || null, lastErrorExcerpt: recentLogExcerpt(slug) });
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
      const fresh = await projectRepo.findBySlug(slug);
      if (!fresh) return;
      const target = health.targetFor(fresh);
      if (!target) return;
      try {
        const hr = await health.checkSystem(target, fresh.health_path || '/');
        const routeAttestation = fresh.route_published && !health.isLocalMode()
          ? await health.checkAttestation(target, slug)
          : { state: 'not_applicable', checkedAt: new Date().toISOString() };
        await projectRepo.updateHealth(slug, { healthState: hr.state, healthStatus: hr.httpStatus, healthResponseMs: hr.responseMs, healthCheckedAt: hr.checkedAt, attestationState: routeAttestation.state, attestationCheckedAt: routeAttestation.checkedAt });
        await projectRepo.updateHealthFailures(slug, hr.state);
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
    const runtimeProject = await projectRepo.findBySlug(slug);
    const containerId = await dockerService.runContainer(
      slug, imageId, port, envVars, { ...projectContainerOptions(runtimeProject, { containerPort }), slot: 'blue' }
    );
    appendBuildLog(slug, `[deploy] Container started: ${containerId}\n`);

    stage = 'route';
    const project = await projectRepo.findBySlug(slug);
    const visibility = project?.visibility || 'public';

    await projectRepo.updateAfterBuild(slug, { containerId, imageId, deployType: projectType });

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
    await projectRepo.updateRoutePublished(slug, published);
    if (project?.id) await pruneReleases(project.id);

    appendBuildLog(slug, `[deploy] Deployment complete.\n`);
    await auditRepo.appendAudit({ user_id: userId, action: 'deploy', target: slug, detail: `port:${port} ${visibility}`, ip });
    notify.send({ kind: 'deploy', slug, detail: 'deployed' }).catch(() => {});
    finishBuild(slug, 'done');
    probeHealthSoon(slug);
  } catch (err) {
    await failBuild({ slug, stage, err, userId, ip, tag: 'deploy' });
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
  const project = await projectRepo.findBySlug(slug);
  const oldContainerId = project.container_id;
  const oldImageId = project.image_id;
  const inactiveSlot = projectRepo.getInactiveSlot(project);
  const inactivePort = projectRepo.getInactivePort(project);

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

    await projectRepo.setPreviousSnap(slug, oldContainerId || null, oldImageId || null);

    try {
      await projectRepo.createDeployHistory(project.id, oldImageId || null, oldContainerId || null);
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
    appendBuildLog(slug, `[redeploy] Starting ${inactiveSlot} container — host ${inactivePort} → container ${containerPort}...\n`);
    const newContainerId = await dockerService.runContainer(
      slug, newImageId, inactivePort, envVars,
      { ...projectContainerOptions(project, { containerPort }), slot: inactiveSlot }
    );
    appendBuildLog(slug, `[redeploy] Container started: ${newContainerId}\n`);

    stage = 'health_gate';
    appendBuildLog(slug, `[redeploy] Health-gating new container on port ${inactivePort}...\n`);
    try {
      await health.waitForHealthy(health.targetForPort(inactivePort), project.health_path || '/');
      appendBuildLog(slug, `[redeploy] Health check passed.\n`);
    } catch (healthErr) {
      appendBuildLog(slug, `[redeploy] Health check failed — rolling back to previous container.\n`);
      try { await dockerService.stopContainer(newContainerId); } catch {}
      try { await dockerService.removeContainer(newContainerId, true); } catch {}
      throw healthErr;
    }

    stage = 'route';
    appendBuildLog(slug, `[redeploy] Swapping traffic to ${inactiveSlot} (port ${inactivePort})...\n`);
    try {
      await proxy.publishRoute({ slug, port: inactivePort, visibility: project.visibility, basicUser: project.basic_user, basicHash: project.basic_hash, apex: !!project.is_primary });
    } catch (e) {
      appendBuildLog(slug, `[redeploy] WARNING: proxy route swap failed: ${e.message}\n`);
    }
    await projectRepo.swapActiveSlot(slug);

    if (oldContainerId) {
      appendBuildLog(slug, `[redeploy] Stopping old container...\n`);
      try { await dockerService.stopContainer(oldContainerId); } catch {}
      try { await dockerService.removeContainer(oldContainerId, true); } catch {}
    }

    await projectRepo.updateAfterRedeploy(slug, { containerId: newContainerId, imageId: newImageId });

    appendBuildLog(slug, `[redeploy] Zero-downtime redeploy complete.\n`);
    await projectRepo.updateGithubDeploySucceeded(slug);
    await auditRepo.appendAudit({ user_id: userId, action: 'redeploy', target: slug, ip });
    notify.send({ kind: 'redeploy', slug, detail: 'redeployed' }).catch(() => {});
    finishBuild(slug, 'done');
    probeHealthSoon(slug);
  } catch (err) {
    await failBuild({ slug, stage, err, userId, ip, tag: 'redeploy' });
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

  const existing = await projectRepo.findBySlugOrName(slug, name);
  if (existing) return { ok: false, code: 409, error: 'A project with this name or slug already exists' };
  if (!buildGate.tryAcquire(slug)) {
    return { ok: false, code: 429, error: 'Build capacity is full. Wait for the active build to finish and try again.' };
  }

  let handedOff = false;
  try {
    const result = await projectRepo.allocateAndCreate(
      { name, slug, visibility },
      dockerService.findFreePort
    );
    if (result.conflict) return { ok: false, code: 409, error: 'A project with this name or slug already exists' };
    const port = result.port;
    const project = result.project;

    // env vars
    if (Object.keys(envVars).length > 0 && process.env.ENV_SECRET) {
      try {
        const { encryptEnvVars } = require('./env');
        const encrypted = encryptEnvVars(envVars);
        await projectRepo.updateEnvVars(slug, encrypted);
      } catch (e) {
        console.error('[deploy] Failed to save env vars:', e);
      }
    }

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
  const project = await projectRepo.findBySlug(slug);
  if (!project) return { ok: false, code: 404, error: 'Project not found' };
  if (project.status === 'building') return { ok: false, code: 409, error: 'Build already in progress' };
  if (!zipPath) return { ok: false, code: 400, error: 'Missing file upload' };
  if (!buildGate.tryAcquire(slug)) {
    return { ok: false, code: 429, error: 'Build capacity is full. Wait for the active build to finish and try again.' };
  }

  let handedOff = false;
  try {
    await projectRepo.updateStatus(slug, 'building');
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
    await projectRepo.updateStatus(slug, project.status);
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
    const taken = !err && await projectRepo.slugTaken(slug);

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
    const project = await projectRepo.findBySlug(slug);
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
