'use strict';

const { prisma } = require('./client');

function toSnake(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    password_hash: row.passwordHash,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') : row.createdAt,
    token_version: row.tokenVersion,
    totp_secret: row.totpSecret,
    totp_enabled: row.totpEnabled ? 1 : 0,
  };
}

// Public projection for anything returned to clients. Never carries the bcrypt
// hash or the raw TOTP seed — only the internal auth paths (login, TOTP verify)
// read those, via the full `toSnake` row.
function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') : row.createdAt,
    totp_enabled: row.totpEnabled ? 1 : 0,
  };
}

function sessionToSnake(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.userId,
    jti: row.jti,
    user_agent: row.userAgent,
    ip: row.ip,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') : row.createdAt,
    last_seen_at: row.lastSeenAt instanceof Date ? row.lastSeenAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') : row.lastSeenAt,
  };
}

async function findByUsername(username) {
  const row = await prisma.user.findUnique({ where: { username } });
  return toSnake(row);
}

async function findById(id) {
  const row = await prisma.user.findUnique({ where: { id } });
  return toSnake(row);
}

async function countUsers() {
  return prisma.user.count();
}

async function createUser(username, passwordHash) {
  const row = await prisma.user.create({ data: { username, passwordHash } });
  return { lastInsertRowid: row.id };
}

async function deleteUser(id) {
  await prisma.user.delete({ where: { id } });
}

async function updatePassword(id, passwordHash) {
  await prisma.user.update({
    where: { id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
}

async function bumpTokenVersion(id) {
  await prisma.user.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
  });
}

async function listUsers() {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toSnake);
}

// Client-safe user list — never includes password_hash / totp_secret.
async function listUsersPublic() {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toPublic);
}

// Client-safe single user — never includes password_hash / totp_secret.
async function findByIdPublic(id) {
  const row = await prisma.user.findUnique({ where: { id } });
  return toPublic(row);
}

async function setupTotp(id, secret) {
  await prisma.user.update({
    where: { id },
    data: { totpSecret: secret, totpEnabled: false },
  });
}

async function enableTotp(id) {
  await prisma.user.update({
    where: { id },
    data: { totpEnabled: true, tokenVersion: { increment: 1 } },
  });
}

async function disableTotp(id) {
  await prisma.user.update({
    where: { id },
    data: { totpEnabled: false, totpSecret: null, tokenVersion: { increment: 1 } },
  });
}

// Sessions

async function createSession(userId, jti, userAgent, ip) {
  await prisma.session.create({ data: { userId, jti, userAgent, ip } });
}

async function findSessionByJti(jti) {
  const row = await prisma.session.findUnique({ where: { jti } });
  return sessionToSnake(row);
}

async function findSessionById(id, userId) {
  const row = await prisma.session.findFirst({ where: { id, userId } });
  return sessionToSnake(row);
}

async function deleteSessionById(id) {
  await prisma.session.delete({ where: { id } });
}

async function deleteSessionByJti(jti) {
  await prisma.session.delete({ where: { jti } }).catch(() => {});
}

async function deleteUserSessions(userId) {
  await prisma.session.deleteMany({ where: { userId } });
}

async function listUserSessions(userId) {
  const rows = await prisma.session.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
  });
  return rows.map(sessionToSnake);
}

async function touchSession(jti) {
  await prisma.session.update({
    where: { jti },
    data: { lastSeenAt: new Date() },
  });
}

// V4 Phase 1: cap concurrent sessions per user — keep the newest `max`,
// revoke the rest (oldest first). Returns how many were revoked.
async function enforceSessionLimit(userId, max = Number(process.env.MAX_SESSIONS_PER_USER) || 5) {
  const excess = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: max,
    select: { id: true },
  });
  if (!excess.length) return 0;
  const { count } = await prisma.session.deleteMany({
    where: { id: { in: excess.map((s) => s.id) } },
  });
  return count;
}

module.exports = {
  findByUsername, findById, countUsers, createUser, deleteUser,
  updatePassword, bumpTokenVersion, listUsers, listUsersPublic, findByIdPublic,
  setupTotp, enableTotp, disableTotp,
  createSession, findSessionByJti, findSessionById,
  deleteSessionById, deleteSessionByJti, deleteUserSessions,
  listUserSessions, touchSession, enforceSessionLimit,
};
