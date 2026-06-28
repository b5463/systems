'use strict';

const fsp = require('fs/promises');
const { projectRepo, auditRepo } = require('../repo');
const { features } = require('../util/flags');
const { slugError } = require('../util/slug');
const { tmpZip } = require('../util/tmp');
const { verifySignature } = require('../util/webhook');
const deploy = require('./deploy');
const dockerService = require('../services/docker');
const proxy = require('../services/proxy');
const notify = require('../services/notify');

function previewSlug(repo, prNumber) {
  const repoSlug = repo.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 20);
  return `preview-${repoSlug}-pr-${prNumber}`;
}

async function downloadZipball(repo, ref, dest) {
  const url = `https://api.github.com/repos/${repo}/zipball/${encodeURIComponent(ref)}`;
  const headers = { 'User-Agent': 'SYSTEMS.', 'Accept': 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`zipball download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buf);
  return dest;
}

async function previewRoutes(fastify) {
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body;
    try { done(null, body.length ? JSON.parse(body.toString('utf8')) : {}); }
    catch (e) { e.statusCode = 400; done(e, undefined); }
  });

  fastify.post('/api/webhook/github/preview', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!features().previewEnvironments) return reply.code(404).send({ error: 'Preview environments are not enabled.' });

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return reply.code(503).send({ error: 'Webhook secret not configured.' });

    const sig = request.headers['x-hub-signature-256'];
    if (!verifySignature(secret, request.rawBody || Buffer.alloc(0), sig)) {
      return reply.code(401).send({ error: 'Invalid signature.' });
    }

    const event = request.headers['x-github-event'];
    if (event === 'ping') return { ok: true, pong: true };
    if (event !== 'pull_request') return { ok: true, ignored: event || 'unknown' };

    const payload = request.body || {};
    const action = payload.action;
    const pr = payload.pull_request;
    const repo = payload.repository && payload.repository.full_name;
    if (!pr || !repo) return reply.code(400).send({ error: 'Malformed PR payload.' });

    const prNumber = pr.number;
    const branch = pr.head && pr.head.ref;
    const slug = previewSlug(repo, prNumber);

    if (action === 'closed') {
      return await cleanupPreview(slug, repo, prNumber, request.ip);
    }

    if (!['opened', 'synchronize', 'reopened'].includes(action)) {
      return { ok: true, ignored: action };
    }

    const existing = await projectRepo.findBySlug(slug);
    if (existing && existing.status !== 'deleted') {
      const zipPath = tmpZip();
      try {
        await downloadZipball(repo, branch, zipPath);
      } catch (e) {
        return reply.code(502).send({ error: e.message });
      }
      const result = await deploy.beginRedeploy({ slug, zipPath, userId: null, ip: request.ip });
      if (!result.ok) {
        await fsp.rm(zipPath, { force: true }).catch(() => {});
        return reply.code(result.code).send({ error: result.error });
      }
      return reply.code(202).send({ ok: true, action: 'redeployed', slug });
    }

    const name = `Preview PR #${prNumber}`;
    const slugErr = slugError(slug);
    if (slugErr) return reply.code(400).send({ error: slugErr });

    const zipPath = tmpZip();
    try {
      await downloadZipball(repo, branch, zipPath);
    } catch (e) {
      return reply.code(502).send({ error: e.message });
    }

    const expiresAt = new Date(Date.now() + (Number(process.env.PREVIEW_TTL_HOURS) || 72) * 3600000);

    const result = await deploy.beginDeploy({
      name, slug, visibility: 'public', zipPath, userId: null, ip: request.ip,
    });
    if (!result.ok) {
      await fsp.rm(zipPath, { force: true }).catch(() => {});
      return reply.code(result.code).send({ error: result.error });
    }

    try {
      await projectRepo.markAsPreview(slug, { branch, prNumber, expiresAt });
    } catch { /* best-effort */ }

    await auditRepo.appendAudit({
      action: 'preview_created', target: slug, detail: `PR #${prNumber} ${repo} ${branch}`,
    });

    return reply.code(202).send({ ok: true, action: 'created', slug });
  });

  fastify.get('/api/previews', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().previewEnvironments) return reply.code(404).send({ error: 'Preview environments are not enabled.' });
    const previews = await projectRepo.listPreviews();
    return { previews };
  });

  fastify.delete('/api/previews/:slug', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!features().previewEnvironments) return reply.code(404).send({ error: 'Preview environments are not enabled.' });
    const { slug } = request.params;
    const result = await cleanupPreview(slug, null, null, request.ip);
    return result;
  });
}

async function cleanupPreview(slug, repo, prNumber, ip) {
  const project = await projectRepo.findBySlug(slug);
  if (!project || project.status === 'deleted') return { ok: true, ignored: 'no preview found' };

  if (project.container_id) {
    try { await dockerService.stopContainer(project.container_id); } catch {}
    try { await dockerService.removeContainer(project.container_id, true); } catch {}
  }
  if (project.image_id) {
    try { await dockerService.removeImage(project.image_id); } catch {}
  }

  try { await proxy.removeRoute(slug); } catch {}
  await projectRepo.softDelete(slug);

  await auditRepo.appendAudit({
    action: 'preview_cleaned', target: slug,
    detail: prNumber ? `PR #${prNumber}` : 'manual', ip,
  });
  notify.send({ kind: 'preview_cleaned', slug, detail: prNumber ? `PR #${prNumber} closed` : 'manual cleanup' }).catch(() => {});

  return { ok: true, cleaned: slug };
}

module.exports = previewRoutes;
module.exports.cleanupPreview = cleanupPreview;
module.exports.previewSlug = previewSlug;
