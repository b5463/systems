'use strict';

const crypto = require('crypto');

const PATH = '/.well-known/systems/v1/attestation';
const MAX_AGE_MS = 5000;
const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;

function masterSecret(env = process.env) {
  const value = env.SYSTEMS_ATTESTATION_SECRET || env.ENV_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SYSTEMS_ATTESTATION_SECRET or ENV_SECRET must be at least 32 characters');
  }
  return value;
}

function derive(label, env = process.env) {
  return crypto.createHmac('sha256', masterSecret(env)).update(`systems-attestation:${label}`).digest();
}

function routeCredential(slug, env = process.env) {
  return crypto.createHmac('sha256', derive('route-credential', env)).update(slug).digest('base64url');
}

function validCredential(slug, supplied, env = process.env) {
  if (typeof supplied !== 'string') return false;
  const expected = routeCredential(slug, env);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function newNonce() {
  return crypto.randomBytes(24).toString('base64url');
}

function validNonce(nonce) {
  return typeof nonce === 'string' && NONCE_RE.test(nonce);
}

function seal(payload, env = process.env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive('payload-encryption', env), iv);
  cipher.setAAD(Buffer.from('SYSTEMS.attestation.v1'));
  const plaintext = Buffer.from(JSON.stringify(payload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

function open(envelope, expected = {}, env = process.env, now = Date.now()) {
  if (!envelope || envelope.v !== 1) throw new Error('unsupported attestation');
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      derive('payload-encryption', env),
      Buffer.from(envelope.iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from('SYSTEMS.attestation.v1'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
      decipher.final(),
    ]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (expected.slug && payload.slug !== expected.slug) throw new Error('slug mismatch');
    if (expected.nonce && payload.nonce !== expected.nonce) throw new Error('nonce mismatch');
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) throw new Error('invalid lifetime');
    if (payload.issuedAt > now + 1000 || payload.expiresAt < now || payload.expiresAt - payload.issuedAt > MAX_AGE_MS) {
      throw new Error('expired attestation');
    }
    return payload;
  } catch (error) {
    if (/mismatch|expired|lifetime|unsupported/.test(error.message)) throw error;
    throw new Error('invalid attestation', { cause: error });
  }
}

function internalUpstream(env = process.env, fallback = 'host.docker.internal:3000') {
  const value = env.SYSTEMS_API_INTERNAL_UPSTREAM || fallback;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?:[1-9][0-9]{0,4}$/.test(value)) {
    throw new Error('Invalid SYSTEMS_API_INTERNAL_UPSTREAM');
  }
  const port = Number(value.slice(value.lastIndexOf(':') + 1));
  if (port > 65535) throw new Error('Invalid SYSTEMS_API_INTERNAL_UPSTREAM');
  return value;
}

module.exports = {
  PATH, MAX_AGE_MS, internalUpstream, newNonce, open, routeCredential,
  seal, validCredential, validNonce,
};
