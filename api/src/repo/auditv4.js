'use strict';

const { prisma } = require('./client');
const { GENESIS, hashEntryV4, verifyChain } = require('../util/audit');
const { currentRequestId } = require('../util/requestcontext');

// V4 Phase 1 org-scoped audit log. Same tamper-evidence model as the legacy
// chain (prev_hash → hash over canonical fields, advisory lock serialises
// writers) with an entity address (entity_type + entity_id) instead of the
// legacy free-form target. request_id is metadata, outside the canonical.
//
// Advisory lock key 3 — key 2 belongs to the legacy audit chain.

function formatForHash(date) {
  if (date instanceof Date) {
    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  }
  return date;
}

async function append({
  organisation_id, admin_user_id = null, action,
  entity_type = null, entity_id = null, detail = null, ip = null, request_id = null,
}) {
  const requestId = request_id ?? currentRequestId();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(3)`;

    // org-scope-exempt: the hash chain is a single platform-wide sequence; rows carry their org
    const prev = await tx.auditLogV4.findFirst({
      orderBy: { id: 'desc' },
      select: { hash: true },
    });
    const prevHash = prev?.hash || GENESIS;

    const row = await tx.auditLogV4.create({
      data: {
        organisationId: organisation_id,
        adminUserId: admin_user_id,
        action,
        entityType: entity_type,
        entityId: entity_id,
        detail,
        ip,
        requestId,
        prevHash,
      },
    });

    const hash = hashEntryV4(prevHash, {
      id: row.id,
      organisation_id: row.organisationId,
      admin_user_id: row.adminUserId,
      action: row.action,
      entity_type: row.entityType,
      entity_id: row.entityId,
      detail: row.detail,
      ip: row.ip,
      created_at: formatForHash(row.createdAt),
    });

    // org-scope-exempt: sealing the hash of the row created just above, by PK
    await tx.auditLogV4.update({ where: { id: row.id }, data: { hash } });
    return row.id;
  });
}

async function verify() {
  // org-scope-exempt: chain verification must walk every row across orgs
  const rows = await prisma.auditLogV4.findMany({ orderBy: { id: 'asc' } });
  const mapped = rows.map((r) => ({
    id: r.id,
    organisation_id: r.organisationId,
    admin_user_id: r.adminUserId,
    action: r.action,
    entity_type: r.entityType,
    entity_id: r.entityId,
    detail: r.detail,
    ip: r.ip,
    created_at: formatForHash(r.createdAt),
    prev_hash: r.prevHash,
    hash: r.hash,
  }));
  return verifyChain(mapped, hashEntryV4);
}

module.exports = { append, verify };
