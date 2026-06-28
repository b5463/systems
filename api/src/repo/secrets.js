'use strict';

const { prisma } = require('./client');

function toSnake(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.projectId,
    key: row.key,
    value: row.value,
    version: row.version,
    rotated_at: row.rotatedAt instanceof Date ? row.rotatedAt.toISOString() : row.rotatedAt,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

async function listByProject(projectId) {
  const rows = await prisma.secret.findMany({
    where: { projectId },
    orderBy: { key: 'asc' },
  });
  return rows.map(toSnake);
}

async function findByProjectAndKey(projectId, key) {
  const row = await prisma.secret.findUnique({
    where: { projectId_key: { projectId, key } },
  });
  return toSnake(row);
}

async function upsert(projectId, key, encryptedValue) {
  const existing = await prisma.secret.findUnique({
    where: { projectId_key: { projectId, key } },
  });
  if (existing) {
    const row = await prisma.secret.update({
      where: { id: existing.id },
      data: { value: encryptedValue, version: { increment: 1 }, rotatedAt: new Date() },
    });
    return toSnake(row);
  }
  const row = await prisma.secret.create({
    data: { projectId, key, value: encryptedValue },
  });
  return toSnake(row);
}

async function remove(projectId, key) {
  await prisma.secret.deleteMany({
    where: { projectId, key },
  });
}

async function removeAllForProject(projectId) {
  await prisma.secret.deleteMany({ where: { projectId } });
}

module.exports = {
  listByProject, findByProjectAndKey, upsert, remove, removeAllForProject,
};
