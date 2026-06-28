'use strict';

const { prisma } = require('./client');

function toSnake(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    token_hash: row.tokenHash,
    prefix: row.prefix,
    scopes: row.scopes,
    last_used_at: row.lastUsedAt instanceof Date ? row.lastUsedAt.toISOString() : row.lastUsedAt,
    expires_at: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

async function create({ userId, name, tokenHash, prefix, scopes, expiresAt }) {
  const row = await prisma.apiToken.create({
    data: { userId, name, tokenHash, prefix, scopes: JSON.stringify(scopes), expiresAt },
  });
  return toSnake(row);
}

async function findByHash(tokenHash) {
  const row = await prisma.apiToken.findUnique({ where: { tokenHash } });
  return toSnake(row);
}

async function listByUser(userId) {
  const rows = await prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toSnake);
}

async function deleteById(id, userId) {
  const row = await prisma.apiToken.findFirst({ where: { id, userId } });
  if (!row) return false;
  await prisma.apiToken.delete({ where: { id } });
  return true;
}

async function touchLastUsed(id) {
  await prisma.apiToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

async function deleteExpired() {
  await prisma.apiToken.deleteMany({
    where: { expiresAt: { not: null, lt: new Date() } },
  });
}

module.exports = {
  create, findByHash, listByUser, deleteById, touchLastUsed, deleteExpired,
};
