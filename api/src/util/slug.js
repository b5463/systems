'use strict';

// Slug rules for deployed systems.
// lowercase letters, numbers, hyphens; no leading/trailing hyphen; 2–50 chars;
// not a reserved name. Used to build subdomains + container names, so this is
// a security boundary — keep it strict.

const RESERVED = new Set([
  'www', 'api', 'admin', 'dashboard', 'dash', 'mail', 'smtp', 'imap', 'ftp',
  'server', 'status', 'root', 'system', 'systems', 'auth', 'login', 'proxy',
  'docker', 'caddy',
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

function isValidSlug(slug) {
  return typeof slug === 'string'
    && slug.length >= 2
    && slug.length <= 50
    && SLUG_RE.test(slug)
    && !slug.includes('--') // avoid confusing/punycode-adjacent forms
    && !slug.startsWith('-')
    && !slug.endsWith('-');
}

function isReserved(slug) {
  return RESERVED.has(String(slug).toLowerCase());
}

/** Validate and return a reason if invalid (null if OK). */
function slugError(slug) {
  if (!isValidSlug(slug)) {
    return 'Slug must be 2–50 chars: lowercase a–z, 0–9 and single hyphens, no leading/trailing hyphen.';
  }
  if (isReserved(slug)) {
    return `"${slug}" is a reserved name and cannot be used.`;
  }
  return null;
}

module.exports = { RESERVED: [...RESERVED], isValidSlug, isReserved, slugError, SLUG_RE };
