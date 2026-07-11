import { execa } from 'execa';
import { registerTool } from './registry.js';
import type { AgentContext } from '../agent/types.js';

registerTool(
  {
    name: 'bash',
    description: 'Run a shell command. Use this to execute code, install packages, run servers, compile, test, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
        cwd: { type: 'string', description: 'Working directory (defaults to workspace)' },
        timeout: { type: 'number', description: 'Timeout in ms (default 60000)' },
        background: { type: 'boolean', description: 'Run in background (for servers/daemons)' },
      },
      required: ['command'],
    },
  },
  async (args, ctx: AgentContext) => {
    const command = args.command as string;
    const cwd = (args.cwd as string) || ctx.workspacePath;
    const timeout = (args.timeout as number) || 60_000;
    const background = args.background as boolean | undefined;

    if (background) {
      // Detach and return PID
      const child = execa('bash', ['-c', command], {
        cwd,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return `Command started in background. PID: ${child.pid}`;
    }

    try {
      const result = await execa('bash', ['-c', command], {
        cwd,
        timeout,
        all: true,
        reject: false,
      });

      const output = result.all || result.stdout || result.stderr || '';
      const exitCode = result.exitCode ?? 0;
      const truncated = output.length > 10_000 ? output.slice(0, 10_000) + '\n...(truncated)' : output;

      if (exitCode !== 0) {
        return `Exit code: ${exitCode}\n${truncated}`;
      }
      return truncated || '(no output)';
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }
);
