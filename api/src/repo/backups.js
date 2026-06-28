'use strict';

const { prisma } = require('./client');

function toSnake(row) {
  if (!row) return null;
  return {
    id: row.id,
    stamp: row.stamp,
    backend: row.backend,
    location: row.location,
    size_bytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
    manifest: row.manifest ? JSON.parse(row.manifest) : null,
    status: row.status,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

async function create({ stamp, backend, location, sizeBytes, manifest, status }) {
  const row = await prisma.backupRecord.create({
    data: {
      stamp, backend: backend || 'local', location,
      sizeBytes: sizeBytes != null ? BigInt(sizeBytes) : null,
      manifest: manifest ? JSON.stringify(manifest) : null,
      status: status || 'completed',
    },
  });
  return toSnake(row);
}

async function findByStamp(stamp) {
  const row = await prisma.backupRecord.findUnique({ where: { stamp } });
  return toSnake(row);
}

async function listAll(limit = 50) {
  const rows = await prisma.backupRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(toSnake);
}

async function updateStatus(stamp, status) {
  await prisma.backupRecord.update({
    where: { stamp },
    data: { status },
  });
}

async function remove(stamp) {
  await prisma.backupRecord.delete({ where: { stamp } }).catch(() => {});
}

async function pruneOldRecords(retentionCount) {
  const keep = await prisma.backupRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: retentionCount,
    select: { id: true },
  });
  const keepIds = keep.map((r) => r.id);
  if (keepIds.length) {
    await prisma.backupRecord.deleteMany({
      where: { id: { notIn: keepIds } },
    });
  }
}

module.exports = {
  create, findByStamp, listAll, updateStatus, remove, pruneOldRecords,
};
