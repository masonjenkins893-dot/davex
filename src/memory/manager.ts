import { getDb } from '../storage/db.js';
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

export async function saveMemory(key: string, value: string, sessionId?: string): Promise<void> {
  const db = getDb();
  const scope = sessionId ? 'session' : 'global';

  const { data: existing } = await db.from('memory').select('id').eq('key', key).eq('scope', scope).maybeSingle();

  if (existing) {
    await db.from('memory').update({ value, updated_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await db.from('memory').insert({ id: uuidv4(), key, value, scope, session_id: sessionId ?? null });
  }
}

export async function getMemory(key: string, sessionId?: string): Promise<string | null> {
  const db = getDb();
  if (sessionId) {
    const { data } = await db.from('memory').select('value').eq('key', key).eq('session_id', sessionId).maybeSingle();
    if (data) return data.value as string;
  }
  const { data } = await db.from('memory').select('value').eq('key', key).eq('scope', 'global').maybeSingle();
  return data ? (data.value as string) : null;
}

export async function listMemory(scope?: 'global' | 'session', sessionId?: string): Promise<MemoryEntry[]> {
  const db = getDb();
  let query = db.from('memory').select('*').order('updated_at', { ascending: false });

  if (scope === 'session' && sessionId) {
    query = query.eq('scope', 'session').eq('session_id', sessionId);
  } else if (scope === 'global') {
    query = query.eq('scope', 'global');
  }

  const { data, error } = await query;
  if (error) throw new Error(`listMemory failed: ${error.message}`);

  return (data ?? []).map(r => ({
    id: r.id,
    key: r.key,
    value: r.value,
    scope: r.scope,
    sessionId: r.session_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function deleteMemory(key: string): Promise<void> {
  const db = getDb();
  await db.from('memory').delete().eq('key', key);
}

export async function clearMemory(scope?: 'global' | 'session'): Promise<void> {
  const db = getDb();
  if (scope) {
    await db.from('memory').delete().eq('scope', scope);
  } else {
    await db.from('memory').delete().neq('id', '__none__');
  }
}

export async function getSessionMessages(sessionId: string): Promise<{ role: string; content: string }[]> {
  const db = getDb();
  const { data, error } = await db.from('messages').select('role, content').eq('session_id', sessionId).order('created_at', { ascending: true });
  if (error) throw new Error(`getSessionMessages failed: ${error.message}`);
  return (data ?? []).map(r => ({ role: r.role, content: r.content }));
}

export async function buildMemoryContext(sessionId?: string): Promise<string> {
  const globals = await listMemory('global');
  if (globals.length === 0) return '';
  const lines = globals.slice(0, 20).map(m => `- ${m.key}: ${m.value}`);
  return `\n## Long-term memory\n${lines.join('\n')}\n`;
}
