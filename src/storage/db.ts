import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * DaveX used to store everything in a local SQLite file via better-sqlite3.
 * That's a native module — it needs to compile C++ against the platform's
 * libc/NDK, which fails on Termux/Android (no NDK) and other constrained
 * environments. Supabase (hosted Postgres, reached over plain HTTPS) has no
 * native dependency at all, so the same code now works identically on a
 * desktop, a server, or a phone.
 *
 * Credentials are supplied once during the setup wizard and cached in
 * ~/.davex/config.json (see config/settings.ts) — never hardcoded here.
 */
export function getDb(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.DAVEX_SUPABASE_URL;
  const key = process.env.DAVEX_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured yet. Run the DaveX setup wizard, or set ' +
      'DAVEX_SUPABASE_URL and DAVEX_SUPABASE_SERVICE_KEY.'
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}

export function isDbConfigured(): boolean {
  return !!(process.env.DAVEX_SUPABASE_URL && process.env.DAVEX_SUPABASE_SERVICE_KEY);
}

// ── Simple key/value config table ────────────────────────────────────────

export async function getConfig(key: string): Promise<string | null> {
  const db = getDb();
  const { data, error } = await db.from('config').select('value').eq('key', key).maybeSingle();
  if (error || !data) return null;
  return data.value as string;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from('config').upsert({ key, value });
  if (error) throw new Error(`setConfig(${key}) failed: ${error.message}`);
}

export async function deleteConfig(key: string): Promise<void> {
  const db = getDb();
  await db.from('config').delete().eq('key', key);
}
