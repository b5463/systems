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
