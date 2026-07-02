'use strict';

const crypto = require('crypto');
const { prisma } = require('./client');

// V4 Phase 1 admin sessions. Token policy per the roadmap:
// - raw token: crypto.randomBytes(32) — returned once at creation, never stored
// - storage: sha256(token) in token_hash
// - max concurrent sessions per admin (default 5): creating one past the cap
//   revokes the oldest

const MAX_SESSIONS = () => Number(process.env.MAX_SESSIONS_PER_ADMIN) || 5;

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

async function create({ organisationId, adminUserId, userAgent = null, ip = null }) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  // org-scope-exempt: creation carries organisationId in its data payload
  const session = await prisma.adminSession.create({
    data: { organisationId, adminUserId, tokenHash: hashToken(rawToken), userAgent, ip },
  });
  const revoked = await enforceLimit(adminUserId, MAX_SESSIONS());
  return { session, rawToken, revoked };
}

// Keep the newest `max` sessions; delete the rest. Returns how many were revoked.
async function enforceLimit(adminUserId, max) {
  // org-scope-exempt: scoped by adminUserId PK from an authenticated session
  const excess = await prisma.adminSession.findMany({
    where: { adminUserId },
    orderBy: { createdAt: 'desc' },
    skip: max,
    select: { id: true },
  });
  if (!excess.length) return 0;
  // org-scope-exempt: ids fetched above, already admin-scoped
  const { count } = await prisma.adminSession.deleteMany({
    where: { id: { in: excess.map((s) => s.id) } },
  });
  return count;
}

async function findByToken(rawToken) {
  // org-scope-exempt: token lookup — the 256-bit token itself is the credential
  return prisma.adminSession.findUnique({ where: { tokenHash: hashToken(rawToken) } });
}

async function touch(id) {
  // org-scope-exempt: touch by session PK obtained from a verified token
  return prisma.adminSession.update({ where: { id }, data: { lastSeenAt: new Date() } });
}

async function deleteById(id) {
  // org-scope-exempt: delete by session PK obtained from a verified token
  return prisma.adminSession.delete({ where: { id } }).catch(() => null);
}

async function deleteAllForAdmin(adminUserId) {
  // org-scope-exempt: scoped by adminUserId PK (sign-out-everywhere)
  const { count } = await prisma.adminSession.deleteMany({ where: { adminUserId } });
  return count;
}

module.exports = { create, enforceLimit, findByToken, touch, deleteById, deleteAllForAdmin, hashToken };
