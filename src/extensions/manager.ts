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
      const existing = db.prepare('SELECT id FROM extensions WHERE name = ?').get(dir.name);
      if (!existing) {
        db.prepare('INSERT INTO extensions (id, name, path, version, enabled) VALUES (?, ?, ?, ?, 1)')
          .run(uuidv4(), dir.name, manifestPath, manifest.version ?? '0.0.1');
      }
    }
  }

  return listExtensions();
}

export function listExtensions(): ExtensionRecord[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM extensions').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    path: r.path,
    version: r.version,
    enabled: r.enabled === 1,
  }));
}

export function toggleExtension(name: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE extensions SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
}

export function removeExtension(name: string): void {
  const db = getDb();
  db.prepare('DELETE FROM extensions WHERE name = ?').run(name);
}
