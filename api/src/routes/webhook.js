'use strict';

const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const { db, auditLog } = require('../db');
const { features } = require('../util/flags');
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

    const project = db.prepare(`SELECT * FROM projects WHERE repo = ? AND status != 'deleted'`).get(repo);
    if (!project) return { ok: true, ignored: 'no system mapped to repo' };

    if (!branchAllowed(ref, project.deploy_branch || 'main')) {
      return { ok: true, ignored: `branch ${ref}` };
    }

    auditLog({ action: 'github_push', target: project.slug, detail: `${repo} ${ref}` });

    // Download the commit zipball and redeploy (best-effort, async).
    const zipPath = `/tmp/${uuidv4()}.zip`;
    try {
      await downloadZipball(repo, ref.replace('refs/heads/', ''), zipPath);
    } catch (e) {
      auditLog({ action: 'redeploy_fail', target: project.slug, detail: e.message });
      notify.send({ kind: 'deploy_failed', slug: project.slug, detail: e.message }).catch(() => {});
      return reply.code(502).send({ error: e.message });
    }

    const result = await deploy.beginRedeploy({ slug: project.slug, zipPath, userId: null, ip: request.ip });
    if (!result.ok) {
      await fsp.rm(zipPath, { force: true }).catch(() => {});
      return reply.code(result.code).send({ error: result.error });
    }
    return reply.code(202).send({ ok: true, redeploying: project.slug });
  });
}

module.exports = webhookRoutes;
