'use strict';

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'platform.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    container_id TEXT,
    image_id TEXT,
    port INTEGER,
    status TEXT NOT NULL DEFAULT 'building',
    env_vars TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Migrations (idempotent) ────────────────────────────────────────────────
// Deploy history / rollback support: keep a reference to the previous
// container + image so a redeploy can be rolled back.
try { db.exec(`ALTER TABLE projects ADD COLUMN previous_image_id TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN previous_container_id TEXT`); } catch {}

// V1.2: visibility, detected deploy type, password basic-auth, health snapshot,
// and whether a public route is currently published.
try { db.exec(`ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN deploy_type TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN basic_user TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN basic_hash TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN health_state TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN health_status INTEGER`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN health_response_ms INTEGER`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN health_checked_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN route_published INTEGER NOT NULL DEFAULT 0`); } catch {}

// Auth: token_version invalidates outstanding JWTs (sign-out-everywhere on
// password change / admin reset / explicit revoke). TOTP two-factor (opt-in).
try { db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`); } catch {}

// GitHub deploy-on-push (V2, gated): map a system to a "owner/name" repo and
// the branch that should trigger a redeploy.
try { db.exec(`ALTER TABLE projects ADD COLUMN repo TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN deploy_branch TEXT NOT NULL DEFAULT 'main'`); } catch {}

// Primary system: the one also served at the bare base domain (apex), e.g.
// acronym.sk -> portfolio, while the dashboard stays on systems.acronym.sk.
try { db.exec(`ALTER TABLE projects ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0`); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS deploy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    image_id TEXT,
    container_id TEXT,
    deployed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE IF NOT EXISTS stats_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cpu_percent REAL,
    memory_mb REAL,
    memory_limit_mb REAL,
    rx_bytes INTEGER,
    tx_bytes INTEGER,
    recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Indexes for hot lookups (webhook repo match, primary lookup, history scans).
  CREATE INDEX IF NOT EXISTS idx_projects_repo ON projects(repo);
  CREATE INDEX IF NOT EXISTS idx_projects_is_primary ON projects(is_primary);
  CREATE INDEX IF NOT EXISTS idx_deploy_history_project ON deploy_history(project_id);
  CREATE INDEX IF NOT EXISTS idx_stats_history_project_time ON stats_history(project_id, recorded_at);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
`);

/**
 * Initialize default users from the ADMIN_USERS environment variable.
 * Format: "user1:password1,user2:password2"
 * Creates users only if they don't already exist.
 */
async function initDefaultUsers() {
  const adminUsers = process.env.ADMIN_USERS;
  if (!adminUsers) {
    return;
  }

  const pairs = adminUsers.split(',').map(s => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) {
      console.warn(`[db] Skipping malformed ADMIN_USERS entry: ${pair}`);
      continue;
    }
    const username = pair.slice(0, colonIdx).trim();
    const password = pair.slice(colonIdx + 1).trim();

    if (!username || !password) {
      console.warn(`[db] Skipping empty username or password in ADMIN_USERS`);
      continue;
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      continue;
    }

    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, password_hash);
    console.log(`[db] Created user: ${username}`);
  }
}

/**
 * Append an entry to the audit log.
 * @param {object} entry
 * @param {number|null} entry.user_id
 * @param {string} entry.action
 * @param {string} [entry.target]
 * @param {string} [entry.detail]
 * @param {string} [entry.ip]
 */
function auditLog({ user_id = null, action, target = null, detail = null, ip = null }) {
  db.prepare(
    'INSERT INTO audit_log (user_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)'
  ).run(user_id, action, target, detail, ip);
}

module.exports = { db, initDefaultUsers, auditLog };
