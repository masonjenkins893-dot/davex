import { prepare } from '../storage/db.js';
import { v4 as uuidv4 } from 'uuid';

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  scope: 'global' | 'session';
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export function saveMemory(key: string, value: string, sessionId?: string): void {
  const scope = sessionId ? 'session' : 'global';
  const existing = prepare('SELECT id FROM memory WHERE key = ? AND scope = ?').get(key, scope);
  if (existing) {
    prepare("UPDATE memory SET value = ?, updated_at = datetime('now') WHERE key = ? AND scope = ?")
      .run(value, key, scope);
  } else {
    prepare('INSERT INTO memory (id, key, value, scope, session_id) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), key, value, scope, sessionId ?? null);
  }
}

export function getMemory(key: string, sessionId?: string): string | null {
  if (sessionId) {
    const row = prepare("SELECT value FROM memory WHERE key = ? AND session_id = ?")
      .get(key, sessionId) as { value: string } | undefined;
    if (row) return row.value;
  }
  const row = prepare("SELECT value FROM memory WHERE key = ? AND scope = 'global'")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function listMemory(scope?: 'global' | 'session', sessionId?: string): MemoryEntry[] {
  let rows: any[];
  if (scope === 'session' && sessionId) {
    rows = prepare('SELECT * FROM memory WHERE scope = ? AND session_id = ? ORDER BY updated_at DESC').all(scope, sessionId);
  } else if (scope === 'global') {
    rows = prepare("SELECT * FROM memory WHERE scope = 'global' ORDER BY updated_at DESC").all();
  } else {
    rows = prepare('SELECT * FROM memory ORDER BY updated_at DESC').all();
  }
  return rows.map(r => ({
    id: r.id,
    key: r.key,
    value: r.value,
    scope: r.scope,
    sessionId: r.session_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function deleteMemory(key: string): void {
  prepare('DELETE FROM memory WHERE key = ?').run(key);
}

export function clearMemory(scope?: 'global' | 'session'): void {
  if (scope) {
    prepare('DELETE FROM memory WHERE scope = ?').run(scope);
  } else {
    prepare('DELETE FROM memory').run();
  }
}

export function getSessionMessages(sessionId: string): { role: string; content: string }[] {
  return (prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as any[])
    .map(r => ({ role: r.role, content: r.content }));
}

export function buildMemoryContext(sessionId?: string): string {
  const globals = listMemory('global');
  if (globals.length === 0) return '';
  const lines = globals.slice(0, 20).map(m => `- ${m.key}: ${m.value}`);
  return `\n## Long-term memory\n${lines.join('\n')}\n`;
}
