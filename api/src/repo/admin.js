'use strict';

const { prisma } = require('./client');

function banToSnake(row) {
  if (!row) return null;
  return {
    id: row.id,
    ip: row.ip,
    reason: row.reason,
    expires_at: row.expiresAt,
    created_by: row.createdBy,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '') : row.createdAt,
  };
}

async function listBans() {
  const rows = await prisma.ipBan.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(banToSnake);
}

async function findBanById(id) {
  const row = await prisma.ipBan.findUnique({ where: { id } });
  return banToSnake(row);
}

async function createBan({ ip, reason, expiresAt, createdBy }) {
  const row = await prisma.ipBan.create({
    data: { ip, reason, expiresAt, createdBy },
  });
  return { lastInsertRowid: row.id };
}

async function deleteBan(id) {
  await prisma.ipBan.delete({ where: { id } });
}

async function findActiveBanByIp(ip) {
  const row = await prisma.ipBan.findFirst({
    where: {
      ip,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date().toISOString() } },
      ],
    },
  });
  return banToSnake(row);
}

async function findActiveCidrBans() {
  const rows = await prisma.ipBan.findMany({
    where: {
      ip: { contains: '/' },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date().toISOString() } },
      ],
    },
  });
  return rows.map(banToSnake);
}

// Platform settings

async function getSetting(key) {
  return prisma.platformSetting.findUnique({ where: { key } });
}

async function upsertSetting(key, value, userId) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: userId, updatedAt: new Date() },
    update: { value, updatedBy: userId, updatedAt: new Date() },
  });
}

async function deleteSetting(key) {
  await prisma.platformSetting.delete({ where: { key } }).catch(() => {});
}

async function updateSettingsBatch(changes, userId) {
  return prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        await tx.platformSetting.delete({ where: { key } }).catch(() => {});
      } else {
        await tx.platformSetting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value), updatedBy: userId, updatedAt: new Date() },
          update: { value: JSON.stringify(value), updatedBy: userId, updatedAt: new Date() },
        });
      }
    }
  });
}

module.exports = {
  listBans, findBanById, createBan, deleteBan,
  findActiveBanByIp, findActiveCidrBans,
  getSetting, upsertSetting, deleteSetting, updateSettingsBatch,
};
