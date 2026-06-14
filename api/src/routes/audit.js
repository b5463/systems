'use strict';

const { db } = require('../db');

async function auditRoutes(fastify, options) {
  // Returns last 200 audit log entries, newest first
  fastify.get('/api/audit', {
    preHandler: [fastify.authenticate],
  }, async () => {
    const entries = db.prepare(`
      SELECT a.id, a.action, a.target, a.detail, a.ip, a.created_at,
             u.username
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 200
    `).all();
    return { entries };
  });
}

module.exports = auditRoutes;
