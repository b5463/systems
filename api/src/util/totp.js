'use strict';

const crypto = require('crypto');

// RFC 6238 TOTP (and RFC 4648 base32), implemented with Node crypto only — no
// third-party dependency. Used for opt-in two-factor on admin login.

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secretBytes, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBytes).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

function totp(secretBase32, { time = Date.now(), step = 30, digits = 6, counterShift = 0 } = {}) {
  const counter = Math.floor(time / 1000 / step) + counterShift;
  return hotp(base32Decode(secretBase32), counter, digits);
}

// Verify a submitted code against the secret, allowing ±window steps for clock
// skew. Constant-time compare per candidate.
function verify(token, secretBase32, { time = Date.now(), step = 30, digits = 6, window = 1 } = {}) {
  if (!token || !secretBase32) return false;
  const clean = String(token).replace(/\s/g, '');
  if (!/^\d{6,8}$/.test(clean)) return false;
  for (let shift = -window; shift <= window; shift++) {
    const candidate = totp(secretBase32, { time, step, digits, counterShift: shift });
    const a = Buffer.from(candidate);
    const b = Buffer.from(clean);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

function otpauthURL(secretBase32, { label = 'admin', issuer = 'SYSTEMS.' } = {}) {
  const l = encodeURIComponent(`${issuer}:${label}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${l}?${params.toString()}`;
}

module.exports = { base32Encode, base32Decode, generateSecret, hotp, totp, verify, otpauthURL };
