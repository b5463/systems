'use strict';

const { projectRepo, auditRepo } = require('../repo');
const dockerService = require('./docker');
const proxy = require('./proxy');
const notify = require('./notify');

let timer = null;

async function cleanupExpired() {
  const expired = await projectRepo.findExpiredPreviews();
  const cleaned = [];
  for (const p of expired) {
    try {
      if (p.container_id) {
        try { await dockerService.stopContainer(p.container_id); } catch {}
        try { await dockerService.removeContainer(p.container_id, true); } catch {}
      }
      if (p.image_id) {
        try { await dockerService.removeImage(p.image_id); } catch {}
      }
      try { await proxy.removeRoute(p.slug); } catch {}
      await projectRepo.softDelete(p.slug);
      await auditRepo.appendAudit({
        action: 'preview_expired', target: p.slug,
        detail: `PR #${p.pull_request_number || '?'}`,
      });
      cleaned.push(p.slug);
    } catch (e) {
      console.error(`[preview-cleanup] Failed to clean ${p.slug}:`, e.message);
    }
  }
  if (cleaned.length) {
    notify.send({ kind: 'preview_expired', detail: `${cleaned.length} preview(s) cleaned up` }).catch(() => {});
  }
  return { cleaned };
}

function start() {
  const { features } = require('../util/flags');
  if (!features().previewEnvironments) return;
  const sec = Number(process.env.PREVIEW_CLEANUP_INTERVAL_SEC) || 300;
  if (sec <= 0) return;
  timer = setInterval(() => { cleanupExpired().catch(() => {}); }, sec * 1000);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { cleanupExpired, start, stop };
