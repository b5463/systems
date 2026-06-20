'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeIp, ipToBigInt, parseCidr, cidrContains, matchesAny, isValidBanTarget,
} = require('../src/util/ipmatch');

test('normalizeIp strips IPv4-mapped IPv6 prefix', () => {
  assert.equal(normalizeIp('::ffff:203.0.113.5'), '203.0.113.5');
  assert.equal(normalizeIp('203.0.113.5'), '203.0.113.5');
  assert.equal(normalizeIp(null), null);
});

test('ipToBigInt parses v4 and v6, rejects garbage', () => {
  assert.equal(ipToBigInt('0.0.0.0').value, 0n);
  assert.equal(ipToBigInt('255.255.255.255').value, 0xffffffffn);
  assert.equal(ipToBigInt('1.2.3.4').version, 4);
  assert.equal(ipToBigInt('::1').version, 6);
  assert.equal(ipToBigInt('256.0.0.1'), null);
  assert.equal(ipToBigInt('not-an-ip'), null);
});

test('parseCidr validates prefix length', () => {
  assert.equal(parseCidr('10.0.0.0/24').bits, 24);
  assert.equal(parseCidr('10.0.0.0/33'), null); // v4 max is 32
  assert.equal(parseCidr('2001:db8::/32').bits, 32);
  assert.equal(parseCidr('2001:db8::/129'), null);
  assert.equal(parseCidr('10.0.0.0'), null); // no slash
});

test('cidrContains: v4 membership', () => {
  assert.equal(cidrContains('10.0.0.0/24', '10.0.0.7'), true);
  assert.equal(cidrContains('10.0.0.0/24', '10.0.1.7'), false);
  assert.equal(cidrContains('192.168.1.0/30', '192.168.1.2'), true);
  assert.equal(cidrContains('192.168.1.0/30', '192.168.1.4'), false);
  assert.equal(cidrContains('203.0.113.5/32', '203.0.113.5'), true);
});

test('cidrContains: v6 membership and version isolation', () => {
  assert.equal(cidrContains('2001:db8::/32', '2001:db8::1'), true);
  assert.equal(cidrContains('2001:db8::/32', '2001:db9::1'), false);
  // A v4 address is never inside a v6 range and vice versa.
  assert.equal(cidrContains('2001:db8::/32', '10.0.0.1'), false);
  assert.equal(cidrContains('10.0.0.0/24', '::1'), false);
});

test('cidrContains matches an IPv4-mapped IPv6 client against a v4 range', () => {
  assert.equal(cidrContains('10.0.0.0/24', '::ffff:10.0.0.9'), true);
});

test('matchesAny: exact and CIDR targets mixed', () => {
  const list = ['203.0.113.5', '10.0.0.0/24', '2001:db8::/48'];
  assert.equal(matchesAny('203.0.113.5', list), true);
  assert.equal(matchesAny('10.0.0.200', list), true);
  assert.equal(matchesAny('2001:db8:0:1::9', list), true);
  assert.equal(matchesAny('8.8.8.8', list), false);
  assert.equal(matchesAny('not-an-ip', list), false);
  assert.equal(matchesAny('10.0.0.1', 'not-an-array'), false);
});

test('isValidBanTarget accepts IPs and sane CIDRs, rejects broad/garbage', () => {
  assert.equal(isValidBanTarget('203.0.113.5'), true);
  assert.equal(isValidBanTarget('2001:db8::1'), true);
  assert.equal(isValidBanTarget('10.0.0.0/24'), true);
  assert.equal(isValidBanTarget('2001:db8::/48'), true);
  assert.equal(isValidBanTarget('0.0.0.0/0'), false);   // would ban everything
  assert.equal(isValidBanTarget('10.0.0.0/4'), false);  // below the v4 /8 floor
  assert.equal(isValidBanTarget('2001:db8::/16'), false); // below the v6 /32 floor
  assert.equal(isValidBanTarget('garbage'), false);
  assert.equal(isValidBanTarget(''), false);
});

test('matcher never throws on malformed targets', () => {
  assert.doesNotThrow(() => matchesAny('1.2.3.4', ['', 'x/y/z', '999.999/8', null, 42]));
});
