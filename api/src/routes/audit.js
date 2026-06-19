'use strict';

const { db, verifyAuditChain } = require('../db');

async function auditRoutes(fastify, options) {
  // Verify the tamper-evident audit-log hash chain. Returns ok=false plus the
  // first offending row id if any entry was modified, removed, or reordered.
  fastify.get('/api/audit/verify', {
    preHandler: [fastify.authenticate],
  }, async () => verifyAuditChain());

  // Returns audit log entries, newest first.
  // Optional filters: action, target (LIKE), username (LIKE), limit (default 100, max 200),
  //   offset (for pagination), from / to (ISO date strings for created_at range)
  fastify.get('/api/audit', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { action, target, username, from, to } = request.query || {};

    let limit = Number(request.query && request.query.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    if (limit > 200) limit = 200;

    let offset = Number(request.query && request.query.offset);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const where = [];
    const params = [];

    if (action) {
      where.push('a.action = ?');
      params.push(action);
    }
    if (target) {
      where.push('a.target LIKE ?');
      params.push(`%${target}%`);
    }
    if (username) {
      where.push('u.username LIKE ?');
      params.push(`%${username}%`);
    }
    if (from) {
      where.push('a.created_at >= ?');
      params.push(from);
    }
    if (to) {
      where.push('a.created_at <= ?');
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const entries = db.prepare(`
      SELECT a.id, a.action, a.target, a.detail, a.ip, a.created_at,
             u.username
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS c
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
    `).get(...params);

    return { entries, total: totalRow.c };
  });
}

module.exports = auditRoutes;
