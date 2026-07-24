const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'saveqart.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    location_label TEXT,
    location_lat REAL,
    location_lng REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    query TEXT NOT NULL,
    location_label TEXT,
    result_count INTEGER DEFAULT 0,
    best_provider TEXT,
    best_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_history_user ON search_history(user_id, created_at DESC);
`);

// --- lightweight migrations: add richer location columns if missing ---
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('users', 'location_pincode', 'TEXT');
ensureColumn('users', 'location_city', 'TEXT');
ensureColumn('users', 'location_state', 'TEXT');

// Password reset + email verification columns.
ensureColumn('users', 'reset_token', 'TEXT');
ensureColumn('users', 'reset_expires', 'INTEGER');
ensureColumn('users', 'email_verified', 'INTEGER DEFAULT 0');
ensureColumn('users', 'verify_token', 'TEXT');

// --- Price history: records each matched provider price per search ---
db.exec(`
  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_name TEXT,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    title TEXT,
    location_label TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_query ON price_history(query, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_price_history_provider ON price_history(query, provider_id, created_at DESC);
`);

// --- Saved baskets for sharing ---
db.exec(`
  CREATE TABLE IF NOT EXISTS saved_baskets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    share_id TEXT NOT NULL UNIQUE,
    name TEXT,
    items TEXT NOT NULL,
    location_label TEXT,
    result_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_baskets_user ON saved_baskets(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_baskets_share ON saved_baskets(share_id);
`);

module.exports = db;
