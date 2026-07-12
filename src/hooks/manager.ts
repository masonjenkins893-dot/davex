import { execa } from 'execa';
import { getConfig, setConfig, getDb } from '../storage/db.js';

export type HookEvent = 'task_start' | 'task_end' | 'tool_before' | 'tool_after' | 'error';

export interface HookConfig {
  event: HookEvent;
  command: string;
}

export async function registerHook(event: HookEvent, command: string): Promise<void> {
  const existing = JSON.parse((await getConfig(`hooks:${event}`)) ?? '[]') as string[];
  existing.push(command);
  await setConfig(`hooks:${event}`, JSON.stringify(existing));
}

export async function listHooks(): Promise<HookConfig[]> {
  const db = getDb();
  const { data, error } = await db.from('config').select('key, value').like('key', 'hooks:%');
  if (error) throw new Error(`listHooks failed: ${error.message}`);

  const result: HookConfig[] = [];
  for (const row of data ?? []) {
    const event = row.key.replace('hooks:', '') as HookEvent;
    const commands = JSON.parse(row.value) as string[];
    for (const command of commands) result.push({ event, command });
  }
  return result;
}

export async function removeHooksForEvent(event: HookEvent): Promise<void> {
  await setConfig(`hooks:${event}`, '[]');
}

export async function runHooks(event: HookEvent, context?: Record<string, string>): Promise<void> {
  const hooks = (await listHooks()).filter(h => h.event === event);
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
