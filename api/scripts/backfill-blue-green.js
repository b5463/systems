'use strict';

const { prisma } = require('../src/repo/client');

async function backfill() {
  const projects = await prisma.project.findMany({
    where: { port: { not: null }, portBlue: null },
  });

  if (!projects.length) {
    console.log('[backfill] No projects need blue/green port allocation.');
    return;
  }

  console.log(`[backfill] ${projects.length} project(s) to backfill...`);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1)`;

    const allPorts = await tx.project.findMany({
      where: { OR: [{ port: { not: null } }, { portBlue: { not: null } }, { portGreen: { not: null } }] },
      select: { id: true, port: true, portBlue: true, portGreen: true },
    });
    const used = new Set();
    for (const r of allPorts) {
      if (r.port != null) used.add(r.port);
      if (r.portBlue != null) used.add(r.portBlue);
      if (r.portGreen != null) used.add(r.portGreen);
    }

    for (const p of projects) {
      let greenPort = null;
      for (let candidate = 4000; candidate <= 5000; candidate++) {
        if (!used.has(candidate)) {
          greenPort = candidate;
          break;
        }
      }
      if (!greenPort) throw new Error(`No free port available for project ${p.slug}`);
      used.add(greenPort);

      await tx.project.update({
        where: { id: p.id },
        data: { portBlue: p.port, portGreen: greenPort, activeSlot: 'blue' },
      });
      console.log(`[backfill] ${p.slug}: portBlue=${p.port}, portGreen=${greenPort}`);
    }
  });

  console.log('[backfill] Done.');
}

backfill()
  .catch((err) => { console.error('[backfill] Error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
