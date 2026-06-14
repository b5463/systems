'use strict';

const crypto = require('crypto');
const { isValidSlug } = require('./slug');

// Pure helpers for Postgres provisioning (V2). Recommended architecture:
// ONE shared Postgres with a per-system database + least-privilege role
// (simplest + lightest on a single Windows host; a container-per-project is
// heavier and harder to back up). These build names/credentials/URLs and mask
// secrets — they do NOT execute SQL (that requires host validation).

function dbName(slug) {
  if (!isValidSlug(slug)) throw new Error('invalid slug');
  return `sys_${slug.replace(/-/g, '_')}`;
}
function dbUser(slug) {
  if (!isValidSlug(slug)) throw new Error('invalid slug');
  return `sys_${slug.replace(/-/g, '_')}_app`;
}
function genPassword(bytes = 24) {
  // URL-safe, no characters that need escaping in a DATABASE_URL.
  return crypto.randomBytes(bytes).toString('base64url');
}
function databaseUrl({ user, password, host, port = 5432, db }) {
  const u = encodeURIComponent(user);
  const p = encodeURIComponent(password);
  return `postgresql://${u}:${p}@${host}:${port}/${db}`;
}

// Mask a DATABASE_URL for display: keep scheme/host/db, hide credentials.
function maskUrl(url) {
  try {
    const m = String(url).match(/^([a-z]+:\/\/)([^:@/]+)(?::[^@]*)?@(.+)$/i);
    if (!m) return '••••••';
    return `${m[1]}${m[2]}:••••@${m[3]}`;
  } catch { return '••••••'; }
}

// The (parameterized — never string-concatenated) SQL a host runner would use.
function provisionPlan({ db, user, password }) {
  return [
    { sql: 'CREATE ROLE :user LOGIN PASSWORD :password', params: { user, password: '••••' } },
    { sql: 'CREATE DATABASE :db OWNER :user', params: { db, user } },
    { sql: 'REVOKE ALL ON DATABASE :db FROM PUBLIC', params: { db } },
  ];
}

module.exports = { dbName, dbUser, genPassword, databaseUrl, maskUrl, provisionPlan };
