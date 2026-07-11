import fs from 'fs-extra';
import path from 'path';
import { getDb } from '../storage/db.js';
import { v4 as uuidv4 } from 'uuid';
import { DAVEX_SKILLS_DIR } from '../config/constants.js';

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  path: string;
  enabled: boolean;
}

export async function loadSkills(): Promise<SkillRecord[]> {
  await fs.ensureDir(DAVEX_SKILLS_DIR);
  const db = getDb();
  const dirs = await fs.readdir(DAVEX_SKILLS_DIR, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const skillFile = path.join(DAVEX_SKILLS_DIR, dir.name, 'SKILL.md');
    if (await fs.pathExists(skillFile)) {
      const content = await fs.readFile(skillFile, 'utf-8');
      const descMatch = content.match(/description:\s*(.+)/i);
      const description = descMatch?.[1]?.trim() ?? '';

      const existing = db.prepare('SELECT id FROM skills WHERE name = ?').get(dir.name);
      if (!existing) {
        db.prepare('INSERT INTO skills (id, name, description, path, enabled) VALUES (?, ?, ?, ?, 1)')
          .run(uuidv4(), dir.name, description, skillFile);
      }
    }
  }

  return listSkills();
}

export function listSkills(): SkillRecord[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM skills').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    path: r.path,
    enabled: r.enabled === 1,
  }));
}

export function toggleSkill(name: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE skills SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
}

export function removeSkill(name: string): void {
  const db = getDb();
  db.prepare('DELETE FROM skills WHERE name = ?').run(name);
}

export async function getActiveSkillsContext(): Promise<string> {
  const skills = listSkills().filter(s => s.enabled);
  if (skills.length === 0) return '';
  const lines = skills.map(s => `- ${s.name}: ${s.description}`);
  return `\n## Available skills\n${lines.join('\n')}\nRead the SKILL.md for a skill before using it.\n`;
}
