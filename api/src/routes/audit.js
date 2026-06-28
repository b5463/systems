'use strict';

const { auditRepo } = require('../repo');
const { parsePagination, paginationEnvelope } = require('../util/pagination');

async function auditRoutes(fastify, options) {
  fastify.get('/api/audit/verify', {
    preHandler: [fastify.authenticate],
  }, async () => auditRepo.verifyAuditChain());

  fastify.get('/api/audit', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { action, actions, target, username, from, to } = request.query || {};
    const { page, perPage, offset } = parsePagination(request.query || {});

    const actionList = actions
      ? String(actions).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50)
      : [];

    const { entries, total } = await auditRepo.query({
      action: actionList.length ? undefined : action,
      actions: actionList.length ? actionList : undefined,
      target,
      username,
      from,
      to,
      limit: perPage,
      offset,
    });

    return { ...paginationEnvelope(entries, total, { page, perPage }), entries };
  });
}

module.exports = auditRoutes;
