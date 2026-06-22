'use strict';

const { prisma } = require('./client');

async function insertStats(projectId, { cpuPercent, memoryMb, memoryLimitMb, rxBytes, txBytes }) {
  await prisma.statsHistory.create({
    data: {
      projectId,
      cpuPercent: cpuPercent ?? 0,
      memoryMb: memoryMb ?? 0,
      memoryLimitMb: memoryLimitMb ?? 0,
      rxBytes: rxBytes != null ? BigInt(rxBytes) : BigInt(0),
      txBytes: txBytes != null ? BigInt(txBytes) : BigInt(0),
    },
  });
}

async function pruneOlderThan(projectId, hours) {
  const cutoff = new Date(Date.now() - hours * 3600000);
  await prisma.statsHistory.deleteMany({
    where: { projectId, recordedAt: { lt: cutoff } },
  });
}

async function getHistory(projectId, hours, bucketSeconds) {
  const rows = await prisma.$queryRaw`
    SELECT
      AVG(cpu_percent) AS cpu_percent,
      AVG(memory_mb) AS memory_mb,
      AVG(rx_bytes::float8) AS rx_bytes,
      AVG(tx_bytes::float8) AS tx_bytes,
      MAX(recorded_at) AS recorded_at
    FROM stats_history
    WHERE project_id = ${projectId}
      AND recorded_at >= NOW() - (${hours} || ' hours')::interval
    GROUP BY FLOOR(EXTRACT(EPOCH FROM recorded_at) / ${bucketSeconds})
    ORDER BY recorded_at ASC
  `;
  return rows.map((r) => ({
    cpu_percent: r.cpu_percent != null ? Number(r.cpu_percent) : 0,
    memory_mb: r.memory_mb != null ? Number(r.memory_mb) : 0,
    rx_bytes: r.rx_bytes != null ? Number(r.rx_bytes) : 0,
    tx_bytes: r.tx_bytes != null ? Number(r.tx_bytes) : 0,
    recorded_at: r.recorded_at instanceof Date ? r.recorded_at.toISOString() : r.recorded_at,
  }));
}

module.exports = { insertStats, pruneOlderThan, getHistory };
