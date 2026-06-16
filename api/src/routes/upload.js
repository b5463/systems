'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { features } = require('../util/flags');
const { validateChunk, fitsOnDisk, uploadTempPath, progressState } = require('../util/upload');
const { slugError } = require('../util/slug');
const deploy = require('./deploy');

// Chunked/streamed upload for large archives (V2). Chunks are appended to a
// temp .part file on disk — never buffered whole in memory — then assembled
// and handed to the same build pipeline as a normal deploy. OFF unless
// ENABLE_LARGE_UPLOADS=true.

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/tmp/systems-uploads';
const sessions = new Map(); // uploadId -> { ..., createdAt }
const SESSION_TTL_MS = (Number(process.env.UPLOAD_SESSION_TTL_MIN) || 30) * 60 * 1000;

// Drop abandoned sessions + their .part files so a client that disappears after
// /init can't leak memory or fill the disk.
let sweeper = null;
async function sweepStaleSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - (s.createdAt || 0) > SESSION_TTL_MS) {
      sessions.delete(id);
      try { await fsp.rm(s.part, { force: true }); } catch { /* best-effort */ }
    }
  }
}

function freeBytes(dir) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(dir);
      return s.bavail * s.bsize;
    }
  } catch { /* unknown */ }
  return Infinity; // can't measure -> don't block
}

async function uploadRoutes(fastify, options) {
  // Receive raw chunk bytes (scoped to this plugin only).
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => done(null, body));

  const guard = async (request, reply) => {
    if (!features().largeUploads) {
      reply.code(404).send({ error: 'Large uploads are not enabled.' });
      return false;
    }
    return true;
  };

  // Sweep abandoned upload sessions periodically (no-op until one exists).
  if (!sweeper) {
    sweeper = setInterval(() => { sweepStaleSessions().catch(() => {}); }, 5 * 60 * 1000);
    if (sweeper.unref) sweeper.unref();
  }

  // Begin a session.
  fastify.post('/api/upload/init', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'slug', 'totalSize', 'totalChunks'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          slug: { type: 'string', minLength: 1, maxLength: 100 },
          visibility: { type: 'string', enum: ['public', 'private'] },
          totalSize: { type: 'integer' },
          totalChunks: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { name, slug, totalSize, totalChunks } = request.body;
    const visibility = request.body.visibility || 'public';

    const sErr = slugError(slug);
    if (sErr) return reply.code(400).send({ error: sErr });

    const maxMb = features().v2UploadMaxMb;
    const vErr = validateChunk({ index: 0, total: totalChunks, chunkSize: 1, totalSize }, { maxMb });
    if (vErr) return reply.code(400).send({ error: vErr });

    await fsp.mkdir(UPLOADS_DIR, { recursive: true });
    if (!fitsOnDisk(totalSize, freeBytes(UPLOADS_DIR))) {
      return reply.code(507).send({ error: 'Not enough disk space for this upload.' });
    }

    const uploadId = uuidv4();
    const part = uploadTempPath(UPLOADS_DIR, uploadId);
    if (!part) return reply.code(500).send({ error: 'Could not allocate upload.' });
    await fsp.writeFile(part, Buffer.alloc(0)); // create empty

    sessions.set(uploadId, {
      name, slug, visibility, totalSize, totalChunks,
      received: 0, bytes: 0, part,
      userId: request.user.id, ip: request.ip,
      createdAt: Date.now(),
    });
    return { uploadId, state: progressState({ received: 0, total: totalSize }) };
  });

  // Append one chunk (raw octet-stream body). Chunks must arrive in order.
  fastify.post('/api/upload/:id/chunk', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const s = sessions.get(request.params.id);
    if (!s) return reply.code(404).send({ error: 'Unknown or expired upload.' });

    const index = Number(request.query.index);
    if (!Number.isInteger(index) || index !== s.received) {
      return reply.code(409).send({ error: `Expected chunk ${s.received}, got ${request.query.index}.` });
    }
    const buf = request.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return reply.code(400).send({ error: 'Empty chunk.' });
    }
    if (s.bytes + buf.length > s.totalSize) {
      return reply.code(413).send({ error: 'Upload exceeded the declared size.' });
    }

    await fsp.appendFile(s.part, buf);
    s.received += 1;
    s.bytes += buf.length;
    return {
      received: s.received,
      bytes: s.bytes,
      state: progressState({ received: s.bytes, total: s.totalSize }),
    };
  });

  // Assemble + start the deploy.
  fastify.post('/api/upload/:id/complete', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const s = sessions.get(request.params.id);
    if (!s) return reply.code(404).send({ error: 'Unknown or expired upload.' });
    if (s.received !== s.totalChunks) {
      return reply.code(409).send({ error: `Upload incomplete (${s.received}/${s.totalChunks} chunks).` });
    }

    const zipPath = `/tmp/${uuidv4()}.zip`;
    try {
      await fsp.rename(s.part, zipPath);
    } catch (e) {
      return reply.code(500).send({ error: `Could not finalize upload: ${e.message}` });
    }
    sessions.delete(request.params.id);

    const result = await deploy.beginDeploy({
      name: s.name, slug: s.slug, visibility: s.visibility,
      zipPath, userId: s.userId, ip: s.ip,
    });
    if (!result.ok) {
      await fsp.rm(zipPath, { force: true }).catch(() => {});
      return reply.code(result.code).send({ error: result.error });
    }
    return reply.code(202).send({ project: result.project });
  });

  // Cancel + clean up.
  fastify.delete('/api/upload/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const s = sessions.get(request.params.id);
    if (s) {
      await fsp.rm(s.part, { force: true }).catch(() => {});
      sessions.delete(request.params.id);
    }
    return { cancelled: true };
  });
}

module.exports = uploadRoutes;
