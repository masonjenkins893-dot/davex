import fs from 'fs-extra';
import path from 'path';
import { getDb } from '../storage/db.js';
import { v4 as uuidv4 } from 'uuid';
import { DAVEX_EXTENSIONS_DIR } from '../config/constants.js';

export interface ExtensionRecord {
  id: string;
  name: string;
  path: string;
  version?: string;
  enabled: boolean;
}

export async function loadExtensions(): Promise<ExtensionRecord[]> {
  await fs.ensureDir(DAVEX_EXTENSIONS_DIR);
  const db = getDb();
  const dirs = await fs.readdir(DAVEX_EXTENSIONS_DIR, { withFileTypes: true }).catch(() => []);

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const manifestPath = path.join(DAVEX_EXTENSIONS_DIR, dir.name, 'extension.json');
    if (await fs.pathExists(manifestPath)) {
      const manifest = await fs.readJson(manifestPath);
      const { data: existing } = await db.from('extensions').select('id').eq('name', dir.name).maybeSingle();
      if (!existing) {
        await db.from('extensions').insert({
          id: uuidv4(), name: dir.name, path: manifestPath, version: manifest.version ?? '0.0.1', enabled: true,
        });
      }
    }
  }

  return listExtensions();
}

export async function listExtensions(): Promise<ExtensionRecord[]> {
  const db = getDb();
  const { data, error } = await db.from('extensions').select('*');
  if (error) throw new Error(`listExtensions failed: ${error.message}`);
  return (data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    path: r.path,
    version: r.version,
    enabled: r.enabled === true,
  }));
}

export async function toggleExtension(name: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db.from('extensions').update({ enabled }).eq('name', name);
}

export async function removeExtension(name: string): Promise<void> {
  const db = getDb();
  await db.from('extensions').delete().eq('name', name);
}
