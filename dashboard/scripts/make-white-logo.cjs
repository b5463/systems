'use strict';
/**
 * Produce a white variant of the official SYSTEMS. wordmark from the black
 * source PNG. This is a pure per-pixel RGB inversion that preserves the alpha
 * channel — it does NOT reshape, restyle, or redraw the logo. 8-bit RGBA only.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SRC = path.resolve(__dirname, '../public/brand/systems-wordmark.png');
const DST = path.resolve(__dirname, '../public/brand/systems-wordmark-white.png');

const buf = fs.readFileSync(SRC);
const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);
const colorType = buf[25];
if (colorType !== 6) throw new Error('expected 8-bit RGBA (colorType 6)');

// gather IDAT
let p = 8; const idat = [];
while (p < buf.length) {
  const len = buf.readUInt32BE(p);
  const type = buf.slice(p + 4, p + 8).toString();
  if (type === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len));
  if (type === 'IEND') break;
  p += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));

const bpp = 4;
const stride = w * bpp;
const out = Buffer.alloc(h * stride); // unfiltered RGBA

function paeth(a, b, c) {
  const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

let si = 0;
for (let y = 0; y < h; y++) {
  const ft = raw[si++];
  for (let x = 0; x < stride; x++) {
    const v = raw[si++];
    const a = x >= bpp ? out[y * stride + x - bpp] : 0;
    const b = y > 0 ? out[(y - 1) * stride + x] : 0;
    const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
    let r;
    switch (ft) {
      case 0: r = v; break;
      case 1: r = v + a; break;
      case 2: r = v + b; break;
      case 3: r = v + ((a + b) >> 1); break;
      case 4: r = v + paeth(a, b, c); break;
      default: throw new Error('bad filter ' + ft);
    }
    out[y * stride + x] = r & 0xff;
  }
}

// invert RGB, keep alpha
for (let i = 0; i < out.length; i += 4) {
  out[i] = 255 - out[i];
  out[i + 1] = 255 - out[i + 1];
  out[i + 2] = 255 - out[i + 2];
}

// re-encode with filter 0 (none) per scanline
const filtered = Buffer.alloc(h * (stride + 1));
for (let y = 0; y < h; y++) {
  filtered[y * (stride + 1)] = 0;
  out.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
}
const comp = zlib.deflateSync(filtered, { level: 9 });

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}
const CRC = (() => { const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } return T; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', comp),
  chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(DST, png);
console.log('wrote', DST, png.length, 'bytes', w + 'x' + h);
