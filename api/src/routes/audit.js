'use strict';

const { auditRepo } = require('../repo');

async function auditRoutes(fastify, options) {
  // Verify the tamper-evident audit-log hash chain. Returns ok=false plus the
  // first offending row id if any entry was modified, removed, or reordered.
  fastify.get('/api/audit/verify', {
    preHandler: [fastify.authenticate],
  }, async () => auditRepo.verifyAuditChain());

  // Returns audit log entries, newest first.
  // Optional filters: action, target (LIKE), username (LIKE), limit (default 100, max 200),
  //   offset (for pagination), from / to (ISO date strings for created_at range)
  fastify.get('/api/audit', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { action, actions, target, username, from, to } = request.query || {};

    let limit = Number(request.query && request.query.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    if (limit > 200) limit = 200;

    let offset = Number(request.query && request.query.offset);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    // `actions` (comma-separated) takes precedence over a single `action` — it
    // backs the category and severity filters, which map to a set of actions.
    const actionList = actions
      ? String(actions).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50)
      : [];

    return auditRepo.query({
      action: actionList.length ? undefined : action,
      actions: actionList.length ? actionList : undefined,
      target,
      username,
      from,
      to,
      limit,
      offset,
    });
  });
}

module.exports = auditRoutes;
