import initSqlJs, { Database } from 'sql.js';
import fs from 'fs-extra';
import path from 'path';
import { DAVEX_DB_PATH, DAVEX_HOME } from '../config/constants.js';

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  throw new Error('Database not initialized. Call initDb() first.');
}

export async function initDb(): Promise<void> {
  if (_db) return;
  fs.ensureDirSync(DAVEX_HOME);
  const SQL = await initSqlJs();
  if (fs.existsSync(DAVEX_DB_PATH)) {
    const fileBuffer = fs.readFileSync(DAVEX_DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }
  runMigrations(_db);
  saveDb();
}

export function saveDb(): void {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DAVEX_DB_PATH, Buffer.from(data));
}

function runMigrations(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS providers (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      api_key    TEXT NOT NULL,
      base_url   TEXT,
      model      TEXT,
      is_active  INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      title       TEXT,
      topic       TEXT,
      platform    TEXT DEFAULT 'terminal',
      chat_id     TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now')),
      is_active   INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      tool_calls  TEXT,
      tool_name   TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory (
      id          TEXT PRIMARY KEY,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      scope       TEXT DEFAULT 'global',
      session_id  TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tool_results (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      tool_name   TEXT NOT NULL,
      input       TEXT,
      output      TEXT,
      error       TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage (
      id                TEXT PRIMARY KEY,
      session_id        TEXT,
      provider          TEXT,
      model             TEXT,
      prompt_tokens     INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens      INTEGER DEFAULT 0,
      created_at        TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todos (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      content     TEXT NOT NULL,
      status      TEXT DEFAULT 'pending',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pairing_codes (
      id          TEXT PRIMARY KEY,
      platform    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      code        TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      used        INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approved_users (
      id          TEXT PRIMARY KEY,
      platform    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      username    TEXT,
      approved_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kanban (
      id          TEXT PRIMARY KEY,
      session_id  TEXT,
      title       TEXT NOT NULL,
      status      TEXT DEFAULT 'todo',
      priority    TEXT DEFAULT 'normal',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      url         TEXT,
      command     TEXT,
      args        TEXT,
      enabled     INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skills (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      path        TEXT,
      enabled     INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS extensions (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL,
      version     TEXT,
      enabled     INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
    CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id);
  `);
}

export function getConfig(key: string): string | null {
  const db = getDb();
  const res = db.exec('SELECT value FROM config WHERE key = ?', [key]);
  if (!res.length || !res[0].values.length) return null;
  return res[0].values[0][0] as string;
}

export function setConfig(key: string, value: string): void {
  const db = getDb();
  db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
  saveDb();
}

export function deleteConfig(key: string): void {
  const db = getDb();
  db.run('DELETE FROM config WHERE key = ?', [key]);
  saveDb();
}
