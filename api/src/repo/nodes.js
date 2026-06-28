'use strict';

const { prisma } = require('./client');

function toSnake(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    role: row.role,
    status: row.status,
    last_health_at: row.lastHealthAt instanceof Date ? row.lastHealthAt.toISOString() : row.lastHealthAt,
    capacity: row.capacity ? JSON.parse(row.capacity) : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

async function create({ name, endpoint, role, capacity, metadata }) {
  const row = await prisma.node.create({
    data: {
      name, endpoint, role: role || 'worker',
      capacity: capacity ? JSON.stringify(capacity) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
  return toSnake(row);
}

async function findById(id) {
  const row = await prisma.node.findUnique({ where: { id } });
  return toSnake(row);
}

async function findByName(name) {
  const row = await prisma.node.findUnique({ where: { name } });
  return toSnake(row);
}

async function listAll() {
  const rows = await prisma.node.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toSnake);
}

async function listHealthy() {
  const rows = await prisma.node.findMany({
    where: { status: 'healthy' },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toSnake);
}

async function updateHealth(id, status) {
  await prisma.node.update({
    where: { id },
    data: { status, lastHealthAt: new Date() },
  });
}

async function updateNode(id, data) {
  const updates = {};
  if (data.endpoint !== undefined) updates.endpoint = data.endpoint;
  if (data.role !== undefined) updates.role = data.role;
  if (data.capacity !== undefined) updates.capacity = data.capacity ? JSON.stringify(data.capacity) : null;
  if (data.metadata !== undefined) updates.metadata = data.metadata ? JSON.stringify(data.metadata) : null;
  await prisma.node.update({ where: { id }, data: updates });
}

async function remove(id) {
  await prisma.project.updateMany({ where: { nodeId: id }, data: { nodeId: null } });
  await prisma.node.delete({ where: { id } });
}

async function countProjectsOnNode(nodeId) {
  return prisma.project.count({ where: { nodeId, NOT: { status: 'deleted' } } });
}

module.exports = {
  create, findById, findByName, listAll, listHealthy,
  updateHealth, updateNode, remove, countProjectsOnNode,
};
