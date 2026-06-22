'use strict';

const { prisma } = require('./client');
const { GENESIS, hashEntry, verifyChain } = require('../util/audit');

function formatForHash(date) {
  if (date instanceof Date) {
    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  }
  return date;
}

async function appendAudit({ user_id = null, action, target = null, detail = null, ip = null }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2)`;

    const prev = await tx.auditLog.findFirst({
      orderBy: { id: 'desc' },
      select: { hash: true },
    });
    const prevHash = prev?.hash || GENESIS;

    const row = await tx.auditLog.create({
      data: { userId: user_id, action, target, detail, ip, prevHash },
    });

    const hashRow = {
      id: row.id,
      user_id: row.userId,
      action: row.action,
      target: row.target,
      detail: row.detail,
      ip: row.ip,
      created_at: formatForHash(row.createdAt),
    };
    const hash = hashEntry(prevHash, hashRow);

    await tx.auditLog.update({
      where: { id: row.id },
      data: { hash },
    });

    return row.id;
  });
}

async function verifyAuditChain() {
  const rows = await prisma.auditLog.findMany({
    orderBy: { id: 'asc' },
  });
  const mapped = rows.map((r) => ({
    id: r.id,
    user_id: r.userId,
    action: r.action,
    target: r.target,
    detail: r.detail,
    ip: r.ip,
    created_at: formatForHash(r.createdAt),
    prev_hash: r.prevHash,
    hash: r.hash,
  }));
  return verifyChain(mapped);
}

async function pruneAudit(retentionDays) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) return { pruned: 0 };
  const cutoff = new Date(Date.now() - days * 86400000);
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { pruned: result.count };
}

async function query({ action, actions, target, username, from, to, limit = 100, offset = 0 }) {
  const where = [];
  const params = [];
  let paramIdx = 1;

  const actionList = actions
    ? String(actions).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50)
    : [];

  let whereSql = '';
  if (actionList.length) {
    where.push(`a.action IN (${actionList.map(() => `$${paramIdx++}`).join(', ')})`);
    params.push(...actionList);
  } else if (action) {
    where.push(`a.action = $${paramIdx++}`);
    params.push(action);
  }
  if (target) {
    where.push(`a.target LIKE $${paramIdx++}`);
    params.push(`%${target}%`);
  }
  if (username) {
    where.push(`u.username LIKE $${paramIdx++}`);
    params.push(`%${username}%`);
  }
  if (from) {
    where.push(`a.created_at >= $${paramIdx++}::timestamptz`);
    params.push(from);
  }
  if (to) {
    where.push(`a.created_at <= $${paramIdx++}::timestamptz`);
    params.push(to);
  }
  whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const entriesQuery = `
    SELECT a.id, a.action, a.target, a.detail, a.ip, a.created_at,
           u.username
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ${whereSql}
    ORDER BY a.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;
  params.push(limit, offset);

  const entries = await prisma.$queryRawUnsafe(entriesQuery, ...params);

  const countParams = params.slice(0, -2);
  const countQuery = `
    SELECT COUNT(*)::int AS c
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ${whereSql}
  `;
  const totalRows = await prisma.$queryRawUnsafe(countQuery, ...countParams);
  const total = totalRows[0]?.c || 0;

  const mapped = entries.map((e) => ({
    id: e.id,
    action: e.action,
    target: e.target,
    detail: e.detail,
    ip: e.ip,
    created_at: e.created_at instanceof Date ? e.created_at.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') : e.created_at,
    username: e.username,
  }));

  return { entries: mapped, total };
}

module.exports = { appendAudit, verifyAuditChain, pruneAudit, query };
