'use strict';

const { dbName, dbUser, genPassword, databaseUrl, maskUrl } = require('../util/dbprovision');

// Execute Postgres provisioning. The 'pg' client is an OPTIONAL dependency and
// required lazily, so the API runs fine without it; provisioning simply reports
// it isn't available. Identifiers are derived from a validated slug and matched
// against a strict allowlist before interpolation (pg cannot parameterize DDL
// identifiers); the generated password is url-safe and quoted as a literal.

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('unsafe identifier');
  return `"${name}"`;
}
function quoteLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function provision(slug) {
  let Client;
  try { ({ Client } = require('pg')); }
  catch { return { ok: false, reason: 'pg client not installed on host' }; }

  const adminUrl = process.env.POSTGRES_ADMIN_URL;
  if (!adminUrl) return { ok: false, reason: 'POSTGRES_ADMIN_URL not configured' };

  const name = dbName(slug);
  const user = dbUser(slug);
  const password = genPassword();
  const host = process.env.POSTGRES_HOST || 'postgres';
  const port = Number(process.env.POSTGRES_PORT) || 5432;

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const roleExists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [user]);
    if (roleExists.rowCount === 0) {
      await client.query(`CREATE ROLE ${quoteIdent(user)} LOGIN PASSWORD ${quoteLiteral(password)}`);
    } else {
      // Rotate the password so the returned URL is always valid.
      await client.query(`ALTER ROLE ${quoteIdent(user)} WITH PASSWORD ${quoteLiteral(password)}`);
    }
    const dbExists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (dbExists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdent(name)} OWNER ${quoteIdent(user)}`);
    }
    await client.query(`REVOKE ALL ON DATABASE ${quoteIdent(name)} FROM PUBLIC`);
  } finally {
    await client.end();
  }

  const url = databaseUrl({ user, password, host, port, db: name });
  return { ok: true, database: name, user, url, masked: maskUrl(url) };
}

module.exports = { provision, quoteIdent, quoteLiteral };
