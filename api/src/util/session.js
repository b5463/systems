'use strict';

const crypto = require('crypto');

const SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-systems_session'
  : 'systems_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    try { cookies[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* malformed cookie */ }
  }
  return cookies;
}

function serializeCookie(name, value, { clear = false } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    clear ? 'Max-Age=0' : `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(reply, token) {
  reply.header('Set-Cookie', serializeCookie(SESSION_COOKIE, token));
}

function clearSessionCookie(reply) {
  reply.header('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { clear: true }));
}

function sessionToken(request) {
  return parseCookies(request.headers && request.headers.cookie)[SESSION_COOKIE];
}

function csrfToken(jti) {
  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  return crypto.createHmac('sha256', secret).update(`systems-csrf:${jti}`).digest('base64url');
}

function validCsrf(jti, supplied) {
  if (!jti || typeof supplied !== 'string') return false;
  const expected = Buffer.from(csrfToken(jti));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  sessionToken,
  csrfToken,
  validCsrf,
};