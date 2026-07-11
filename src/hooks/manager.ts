import { execa } from 'execa';
import { getConfig, setConfig, getDb } from '../storage/db.js';

export type HookEvent = 'task_start' | 'task_end' | 'tool_before' | 'tool_after' | 'error';

export interface HookConfig {
  event: HookEvent;
  command: string;
}

export function registerHook(event: HookEvent, command: string): void {
  const db = getDb();
  const existing = JSON.parse(getConfig(`hooks:${event}`) ?? '[]') as string[];
  existing.push(command);
  setConfig(`hooks:${event}`, JSON.stringify(existing));
}

export function listHooks(): HookConfig[] {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM config WHERE key LIKE 'hooks:%'").all() as any[];
  const result: HookConfig[] = [];
  for (const row of rows) {
    const event = row.key.replace('hooks:', '') as HookEvent;
    const commands = JSON.parse(row.value) as string[];
    for (const command of commands) result.push({ event, command });
  }
  return result;
}

export function removeHooksForEvent(event: HookEvent): void {
  setConfig(`hooks:${event}`, '[]');
}

export async function runHooks(event: HookEvent, context?: Record<string, string>): Promise<void> {
  const hooks = listHooks().filter(h => h.event === event);
  for (const hook of hooks) {
    try {
      await execa('bash', ['-c', hook.command], {
        env: { ...process.env, ...context },
        timeout: 15_000,
        reject: false,
      });
    } catch {
      // Hooks fail silently — don't block the agent loop
    }
  }
}
