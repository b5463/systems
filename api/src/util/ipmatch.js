'use strict';

// Pure IP / CIDR matching for the persistent denylist. No I/O, no state — given
// a client IP and a list of ban targets (exact IPs or CIDR ranges), decide
// membership. Kept total: every function returns false / null on malformed
// input rather than throwing, because the caller runs it on the pre-auth hot
// path for every request and must never be tripped into a 500 by a bad row.

const net = require('net');

// Strip an IPv4-mapped IPv6 prefix so `::ffff:1.2.3.4` compares as `1.2.3.4`.
function normalizeIp(ip) {
  if (typeof ip !== 'string') return null;
  const s = ip.trim();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  return m ? m[1] : s;
}

function v4ToBigInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) + BigInt(n);
  }
  return value;
}

function v6ToBigInt(ip) {
  const halves = ip.split('::');
  if (halves.length > 2) return null;

  // Expand a trailing dotted-quad (e.g. `::ffff:1.2.3.4`) into two hextets.
  const expand = (groups) => {
    const out = [];
    for (const g of groups) {
      if (g.includes('.')) {
        const v4 = v4ToBigInt(g);
        if (v4 === null) return null;
        out.push(Number((v4 >> 16n) & 0xffffn).toString(16));
        out.push(Number(v4 & 0xffffn).toString(16));
      } else {
        out.push(g);
      }
    }
    return out;
  };

  const head = expand(halves[0] ? halves[0].split(':') : []);
  const tail = expand(halves.length === 2 && halves[1] ? halves[1].split(':') : []);
  if (head === null || tail === null) return null;

  const missing = 8 - (head.length + tail.length);
  let groups;
  if (halves.length === 2) {
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    if (missing !== 0) return null;
    groups = head;
  }
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    value = (value << 16n) + BigInt(parseInt(g, 16));
  }
  return value;
}

// → { version: 4|6, value: BigInt } or null.
function ipToBigInt(ip) {
  const norm = normalizeIp(ip);
  if (norm === null) return null;
  const version = net.isIP(norm);
  if (version === 4) {
    const value = v4ToBigInt(norm);
    return value === null ? null : { version: 4, value };
  }
  if (version === 6) {
    const value = v6ToBigInt(norm);
    return value === null ? null : { version: 6, value };
  }
  return null;
}

// → { version, value, bits, maxBits } or null.
function parseCidr(cidr) {
  if (typeof cidr !== 'string') return null;
  const slash = cidr.indexOf('/');
  if (slash < 0) return null;
  const parsed = ipToBigInt(cidr.slice(0, slash));
  if (!parsed) return null;
  const bitsStr = cidr.slice(slash + 1);
  if (!/^\d{1,3}$/.test(bitsStr)) return null;
  const bits = Number(bitsStr);
  const maxBits = parsed.version === 4 ? 32 : 128;
  if (bits > maxBits) return null;
  return { version: parsed.version, value: parsed.value, bits, maxBits };
}

// Does `ip` fall inside `cidr`? Both must be the same IP version.
function cidrContains(cidr, ip) {
  const c = parseCidr(cidr);
  const target = ipToBigInt(ip);
  if (!c || !target || c.version !== target.version) return false;
  const shift = BigInt(c.maxBits - c.bits);
  return (c.value >> shift) === (target.value >> shift);
}

// Is `ip` matched by any target (exact IP equality or CIDR containment)?
function matchesAny(ip, targets) {
  const norm = normalizeIp(ip);
  if (norm === null || !Array.isArray(targets)) return false;
  const normParsed = ipToBigInt(norm);
  for (const t of targets) {
    if (typeof t !== 'string') continue;
    if (t.includes('/')) {
      if (cidrContains(t, norm)) return true;
    } else {
      const tp = ipToBigInt(t);
      if (tp && normParsed && tp.version === normParsed.version && tp.value === normParsed.value) return true;
    }
  }
  return false;
}

// Validate an operator-supplied ban target. Accepts a single IP or a CIDR
// range, but refuses dangerously broad prefixes (a /0 or near-/0 would ban most
// of the internet, including the operator). v4 floor /8, v6 floor /32.
function isValidBanTarget(str) {
  if (typeof str !== 'string') return false;
  if (str.includes('/')) {
    const c = parseCidr(str);
    if (!c) return false;
    const floor = c.version === 4 ? 8 : 32;
    return c.bits >= floor;
  }
  return net.isIP(str) !== 0;
}

module.exports = {
  normalizeIp,
  ipToBigInt,
  parseCidr,
  cidrContains,
  matchesAny,
  isValidBanTarget,
};
