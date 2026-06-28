'use strict';

const { nodeRepo } = require('../repo');

async function selectNode() {
  const healthy = await nodeRepo.listHealthy();
  if (!healthy.length) return null;

  let best = null;
  let bestCount = Infinity;

  for (const node of healthy) {
    const count = await nodeRepo.countProjectsOnNode(node.id);
    const cap = node.capacity;
    if (cap && cap.maxContainers && count >= cap.maxContainers) continue;
    if (count < bestCount) {
      best = node;
      bestCount = count;
    }
  }

  return best;
}

let healthTimer = null;

async function reconcileNodeHealth() {
  const nodes = await nodeRepo.listAll();
  for (const node of nodes) {
    try {
      const url = `${node.endpoint.replace(/\/$/, '')}/_ping`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      await nodeRepo.updateHealth(node.id, res.ok ? 'healthy' : 'degraded');
    } catch {
      await nodeRepo.updateHealth(node.id, 'offline');
    }
  }
}

function start() {
  const { features } = require('../util/flags');
  if (!features().multiNode) return;
  const sec = Number(process.env.NODE_HEALTH_INTERVAL_SEC) || 60;
  if (sec <= 0) return;
  reconcileNodeHealth().catch(() => {});
  healthTimer = setInterval(() => { reconcileNodeHealth().catch(() => {}); }, sec * 1000);
  if (healthTimer.unref) healthTimer.unref();
}

function stop() {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = null;
}

module.exports = { selectNode, reconcileNodeHealth, start, stop };
