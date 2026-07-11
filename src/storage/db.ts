import Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import { DAVEX_DB_PATH, DAVEX_HOME } from '../config/constants.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.ensureDirSync(DAVEX_HOME);
  _db = new Database(DAVEX_DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
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
      session_id  TEXT NOT NULL REFERENCES sessions(id),
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
      id              TEXT PRIMARY KEY,
      session_id      TEXT,
      provider        TEXT,
      model           TEXT,
      prompt_tokens   INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens    INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now'))
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
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setConfig(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

export function deleteConfig(key: string): void {
  const db = getDb();
  db.prepare('DELETE FROM config WHERE key = ?').run(key);
}
