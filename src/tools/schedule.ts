import cron from 'node-cron';
import { registerTool } from './registry.js';
import { getDb } from '../storage/db.js';
import { v4 as uuidv4 } from 'uuid';

const activeJobs = new Map<string, cron.ScheduledTask>();

registerTool(
  {
    name: 'schedule_task',
    description: 'Schedule a task to run on a cron schedule.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the task' },
        schedule: { type: 'string', description: 'Cron expression e.g. "0 9 * * *" = every day 9am' },
        command: { type: 'string', description: 'Shell command to run' },
      },
      required: ['name', 'schedule', 'command'],
    },
  },
  async (args) => {
    const name = args.name as string;
    const schedule = args.schedule as string;
    const command = args.command as string;

    if (!cron.validate(schedule)) return `Invalid cron expression: ${schedule}`;

    const id = uuidv4();
    const db = getDb();
    await db.from('config').upsert({
      key: `cron:${name}`,
      value: JSON.stringify({ id, name, schedule, command }),
    });

    const { execa } = await import('execa');
    const job = cron.schedule(schedule, async () => {
      await execa('bash', ['-c', command], { reject: false });
    });

    activeJobs.set(name, job);
    return `Scheduled "${name}" with cron: ${schedule}\nCommand: ${command}`;
  }
);

registerTool(
  {
    name: 'list_schedules',
    description: 'List all scheduled tasks.',
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    const db = getDb();
    const { data: rows, error } = await db.from('config').select('key, value').like('key', 'cron:%');
    if (error) return `Error listing schedules: ${error.message}`;
    if (!rows || rows.length === 0) return 'No scheduled tasks.';
    return rows.map(r => {
      const task = JSON.parse(r.value);
      const running = activeJobs.has(task.name);
      return `• ${task.name} [${running ? '▶ running' : '⏸ stopped'}]\n  Schedule: ${task.schedule}\n  Command: ${task.command}`;
    }).join('\n');
  }
);

registerTool(
  {
    name: 'cancel_schedule',
    description: 'Cancel a scheduled task.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Task name to cancel' },
      },
      required: ['name'],
    },
  },
  async (args) => {
    const name = args.name as string;
    const job = activeJobs.get(name);
    if (job) { job.stop(); activeJobs.delete(name); }
    const db = getDb();
    await db.from('config').delete().eq('key', `cron:${name}`);
    return `Cancelled schedule: ${name}`;
  }
);
