'use strict';

// V4 Phase 5 (Alex) — public catalog DTO allowlist.
//
// Everything served under /api/public/* passes through here first. The public
// boundary is allowlist-only: each object type has an explicit set of fields
// that may leave the building. Anything else (a container id, port, repo URL,
// admin/customer id, secret name, …) is a leak — so in non-production we THROW
// (fail the test/CI loudly) and in production we STRIP the field and record an
// audit event, never silently emitting it.
//
// Pure logic: the audit sink is injected so this unit-tests without a DB.

// Allowed fields per object type in a portfolio snapshot. `data` on a block is
// author-controlled CMS content (already base64/embedded-media checked at
// publish time) and is passed through whole.
const ALLOW = {
  root: ['schemaVersion', 'rendererMinVersion', 'locale', 'pages', 'profiles', 'redirects', 'legal', 'blocks'],
  page: ['slug', 'pageType', 'title', 'seoTitle', 'seoDescription'],
  profile: ['productId', 'title', 'tagline', 'shortDescription', 'fullDescription', 'seoTitle', 'seoDescription', 'coverMediaUrl'],
  block: ['ownerType', 'ownerId', 'blockType', 'position', 'data'],
  redirect: ['from', 'to', 'statusCode'],
  legal: ['docType', 'version', 'effectiveAt'],
};

// Field-name patterns that must NEVER appear at the public boundary, whatever
// the allowlist says — a belt-and-braces denylist so a future allowlist typo
// can't leak these. Matched case-insensitively against key names.
const FORBIDDEN_KEY = /(container|port|repo|secret|password|token|api[_-]?key|admin|customer|billing|email|env[_-]?var|internal|hash)/i;

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Enforce the allowlist for one object. Returns the sanitized object; pushes
// violations into `violations`.
function pick(obj, allowed, path, violations) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const here = `${path}.${key}`;
    if (!allowed.includes(key) || FORBIDDEN_KEY.test(key)) {
      violations.push(here);
      continue; // stripped
    }
    out[key] = value;
  }
  return out;
}

// Produce the public-safe catalog DTO from a snapshot's parsed content.
// `opts.isProd` selects strip+audit (true) vs throw (false); `opts.audit` is
// the injected sink invoked once per violation in prod.
function toPublicCatalog(content, { isProd = false, audit = null } = {}) {
  if (!isPlainObject(content)) throw new Error('catalog content must be an object');
  const violations = [];

  const root = pick(content, ALLOW.root, '$', violations);
  const mapItems = (arr, allowed, name) =>
    (Array.isArray(arr) ? arr : []).map((item, i) => (isPlainObject(item) ? pick(item, allowed, `$.${name}[${i}]`, violations) : null))
      .filter(Boolean);

  const dto = {
    schemaVersion: root.schemaVersion,
    rendererMinVersion: root.rendererMinVersion,
    locale: root.locale,
    pages: mapItems(content.pages, ALLOW.page, 'pages'),
    profiles: mapItems(content.profiles, ALLOW.profile, 'profiles'),
    blocks: mapItems(content.blocks, ALLOW.block, 'blocks'),
    redirects: mapItems(content.redirects, ALLOW.redirect, 'redirects'),
    legal: mapItems(content.legal, ALLOW.legal, 'legal'),
  };

  if (violations.length) {
    if (!isProd) {
      // Fail loudly in dev/test/CI so a leak is caught before it ships.
      throw new Error(`public catalog would leak non-allowlisted fields: ${violations.join(', ')}`);
    }
    // Production: the fields are already stripped from `dto`; record the event.
    if (audit) {
      try { audit({ action: 'public_dto_field_stripped', detail: violations.join(', ') }); } catch { /* never break a public read */ }
    }
  }

  return dto;
}

module.exports = { ALLOW, FORBIDDEN_KEY, toPublicCatalog };
