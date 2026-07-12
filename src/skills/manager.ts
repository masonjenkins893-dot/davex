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

      const { data: existing } = await db.from('skills').select('id').eq('name', dir.name).maybeSingle();
      if (!existing) {
        await db.from('skills').insert({ id: uuidv4(), name: dir.name, description, path: skillFile, enabled: true });
      }
    }
  }

  return listSkills();
}

export async function listSkills(): Promise<SkillRecord[]> {
  const db = getDb();
  const { data, error } = await db.from('skills').select('*');
  if (error) throw new Error(`listSkills failed: ${error.message}`);
  return (data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    path: r.path,
    enabled: r.enabled === true,
  }));
}

export async function toggleSkill(name: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db.from('skills').update({ enabled }).eq('name', name);
}

export async function removeSkill(name: string): Promise<void> {
  const db = getDb();
  await db.from('skills').delete().eq('name', name);
}

export async function getActiveSkillsContext(): Promise<string> {
  const skills = (await listSkills()).filter(s => s.enabled);
  if (skills.length === 0) return '';
  const lines = skills.map(s => `- ${s.name}: ${s.description}`);
  return `\n## Available skills\n${lines.join('\n')}\nRead the SKILL.md for a skill before using it.\n`;
}
