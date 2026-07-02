#!/usr/bin/env node
'use strict';

// V4 Phase 2 — org-scoping lint (roadmap: "CI lint rule rejects unscoped
// queries on scoped tables; one violation fails the build").
//
// Two rules over api/src/**/*.js:
//
//   1. Raw SQL ($queryRaw/$executeRaw/…Unsafe) that names a scoped table must
//      contain the substring `organisation_id`.
//   2. Prisma model calls on scoped models (prisma.system.findMany, …) must
//      reference `organisationId` within the same statement.
//
// A line can be exempted with a trailing `// org-scope-exempt: <reason>` —
// use only when scoping is guaranteed by construction (e.g. lookups by
// primary keys that were themselves fetched org-scoped).

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

const SCOPED_TABLES = [
  'systems', 'products', 'system_environments', 'releases', 'domains',
  'environment_secrets', 'infrastructure_metrics', 'health_snapshots',
  'legacy_project_map', 'admin_users', 'admin_sessions', 'audit_log_v4',
  'customers', 'orders', 'subscriptions', 'entitlement_grants', 'licences',
  'accounts', 'product_users',
];
const SCOPED_MODELS = [
  'system', 'product', 'systemEnvironment', 'release', 'domain',
  'environmentSecret', 'infrastructureMetric', 'healthSnapshot',
  'legacyProjectMap', 'adminUser', 'adminSession', 'auditLogV4',
];

const EXEMPT = /org-scope-exempt:/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

// Grab the statement starting at line i (joined until parens balance or 15 lines).
function statementFrom(lines, i) {
  let depth = 0;
  let out = '';
  for (let j = i; j < Math.min(i + 15, lines.length); j++) {
    out += lines[j] + '\n';
    for (const ch of lines[j]) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
    }
    if (j > i && depth <= 0) break;
  }
  return out;
}

const rawSqlRe = /\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)/;
const modelCallRe = new RegExp(
  `\\.(?:${SCOPED_MODELS.join('|')})\\.(findMany|findFirst|findUnique|updateMany|update|deleteMany|delete|count|groupBy|aggregate)\\b`,
);
const tableRe = new RegExp(`\\b(?:FROM|UPDATE|INTO|JOIN)\\s+"?(${SCOPED_TABLES.join('|')})"?\\b`, 'i');

const violations = [];

for (const file of walk(SRC)) {
  const rel = path.relative(path.join(__dirname, '..'), file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Exemption annotation applies on the flagged line or the line above it.
    if (EXEMPT.test(line) || (i > 0 && EXEMPT.test(lines[i - 1]))) continue;

    if (rawSqlRe.test(line)) {
      const stmt = statementFrom(lines, i);
      if (EXEMPT.test(stmt)) continue;
      if (tableRe.test(stmt) && !stmt.includes('organisation_id')) {
        violations.push(`${rel}:${i + 1} raw SQL on a scoped table without organisation_id`);
      }
    }

    if (modelCallRe.test(line)) {
      const stmt = statementFrom(lines, i);
      if (EXEMPT.test(stmt)) continue;
      if (!stmt.includes('organisationId')) {
        violations.push(`${rel}:${i + 1} prisma call on a scoped model without organisationId`);
      }
    }
  }
}

if (violations.length) {
  console.error('Org-scoping violations (add organisation scoping or an org-scope-exempt annotation):');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('org-scoping lint: clean');
