'use strict';

const { db } = require('../db');

async function auditRoutes(fastify, options) {
  // Returns audit log entries, newest first.
  // Optional filters: action, target (LIKE), username (LIKE), limit (default 100, max 200)
  fastify.get('/api/audit', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { action, target, username } = request.query || {};

    let limit = Number(request.query && request.query.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    if (limit > 200) limit = 200;

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

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const entries = db.prepare(`
      SELECT a.id, a.action, a.target, a.detail, a.ip, a.created_at,
             u.username
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(...params, limit);

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
