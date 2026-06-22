'use strict';

const fsp = require('fs/promises');
const { projectRepo, auditRepo } = require('../repo');
const { features } = require('../util/flags');
const { tmpZip } = require('../util/tmp');
const { verifySignature, branchAllowed } = require('../util/webhook');
const notify = require('../services/notify');
const deploy = require('./deploy');

// GitHub deploy-on-push (V2). OFF unless ENABLE_GITHUB_DEPLOYS=true and a
// GITHUB_WEBHOOK_SECRET is set. Verifies the HMAC signature over the RAW body,
// filters to the configured branch, maps the repo to a system, downloads the
// commit's zipball and runs the same redeploy pipeline as a manual redeploy.
//
// Pulling + building external code is the genuinely risky part, which is why it
// stays behind the flag and is validated on the real host.

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

async function webhookRoutes(fastify, options) {
  // Keep the RAW body so the HMAC signature can be verified (scoped to this
  // plugin only — the rest of the app keeps normal JSON parsing).
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body;
    try { done(null, body.length ? JSON.parse(body.toString('utf8')) : {}); }
    catch (e) { e.statusCode = 400; done(e, undefined); }
  });

  fastify.post('/api/webhook/github', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!features().githubDeploys) return reply.code(404).send({ error: 'GitHub deploys are not enabled.' });

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return reply.code(503).send({ error: 'Webhook secret not configured.' });

    const sig = request.headers['x-hub-signature-256'];
    if (!verifySignature(secret, request.rawBody || Buffer.alloc(0), sig)) {
      return reply.code(401).send({ error: 'Invalid signature.' });
    }

    const event = request.headers['x-github-event'];
    if (event === 'ping') return { ok: true, pong: true };
    if (event !== 'push') return { ok: true, ignored: event || 'unknown' };

    const payload = request.body || {};
    const repo = payload.repository && payload.repository.full_name;
    const ref = payload.ref;
    if (!repo || !ref) return reply.code(400).send({ error: 'Malformed push payload.' });

    const project = await projectRepo.findByRepo(repo);
    if (!project) return { ok: true, ignored: 'no system mapped to repo' };

    if (!branchAllowed(ref, project.deploy_branch || 'main')) {
      return { ok: true, ignored: `branch ${ref}` };
    }

    await auditRepo.appendAudit({ action: 'github_push', target: project.slug, detail: `${repo} ${ref}` });
    await projectRepo.updateGithubDeployStatus(project.slug, 'downloading', `${repo} ${ref}`.slice(0, 300));

    // Download the commit zipball and redeploy (best-effort, async).
    const zipPath = tmpZip();
    try {
      await downloadZipball(repo, ref.replace('refs/heads/', ''), zipPath);
    } catch (e) {
      await auditRepo.appendAudit({ action: 'redeploy_fail', target: project.slug, detail: e.message });
      await projectRepo.updateGithubDeployStatus(project.slug, 'failed', e.message.slice(0, 500));
      notify.send({ kind: 'deploy_failed', slug: project.slug, detail: e.message }).catch(() => {});
      return reply.code(502).send({ error: e.message });
    }

    await projectRepo.updateGithubDeployStatus(project.slug, 'building', `Push accepted from ${repo}`.slice(0, 300));
    const result = await deploy.beginRedeploy({ slug: project.slug, zipPath, userId: null, ip: request.ip });
    if (!result.ok) {
      await fsp.rm(zipPath, { force: true }).catch(() => {});
      await projectRepo.updateGithubDeployStatus(project.slug, 'failed', result.error.slice(0, 500));
      return reply.code(result.code).send({ error: result.error });
    }
    return reply.code(202).send({ ok: true, redeploying: project.slug });
  });
}

module.exports = webhookRoutes;
