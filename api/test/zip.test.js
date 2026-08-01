'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { extractZip } = require('../src/services/zip');

// Minimal stored (uncompressed) ZIP writer — enough for extractZip, which reads
// stored and deflated entries. Keeping it local avoids a dep for one fixture.
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [filename, value] of Object.entries(entries)) {
    const name = Buffer.from(filename);
    const data = Buffer.from(value);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const c of centrals) centralSize += c.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

test('extractZip returns every file and writes complete contents', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
  const zipPath = path.join(dir, 'in.zip');
  const dest = path.join(dir, 'out');

  const files = {};
  // Many entries, including a larger last file, to surface the flush race:
  // the last write must be on disk before extractZip resolves.
  for (let i = 0; i < 60; i++) files[`src/file-${i}.txt`] = `contents of file ${i}\n`.repeat(50);
  files['README.md'] = 'x'.repeat(500000);

  await fsp.writeFile(zipPath, zip(files));
  const extracted = await extractZip(zipPath, dest);

  assert.equal(extracted.length, Object.keys(files).length, 'all entries reported');
  for (const [name, content] of Object.entries(files)) {
    const onDisk = fs.readFileSync(path.join(dest, name), 'utf8');
    assert.equal(onDisk, content, `${name} fully written`);
  }
  await fsp.rm(dir, { recursive: true, force: true });
});

test('extractZip rejects a zip-slip entry', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'zip-slip-'));
  const zipPath = path.join(dir, 'evil.zip');
  await fsp.writeFile(zipPath, zip({ '../escape.txt': 'nope' }));
  await assert.rejects(() => extractZip(zipPath, path.join(dir, 'out')), /Zip slip/);
  await fsp.rm(dir, { recursive: true, force: true });
});
