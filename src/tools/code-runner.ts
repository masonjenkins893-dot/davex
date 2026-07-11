import { execa } from 'execa';
import getPort from 'get-port';
import { registerTool } from './registry.js';
import type { AgentContext } from '../agent/types.js';

// Track background servers
const runningServers = new Map<string, { pid: number; port: number; command: string }>();

registerTool(
  {
    name: 'run_code',
    description: 'Run code directly in the terminal. Supports node, python, bash scripts, etc.',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['node', 'python', 'python3', 'bash', 'ruby', 'deno', 'bun'], description: 'Language to run' },
        code: { type: 'string', description: 'Code to run' },
        cwd: { type: 'string', description: 'Working directory' },
      },
      required: ['language', 'code'],
    },
  },
  async (args, ctx) => {
    const lang = args.language as string;
    const code = args.code as string;
    const cwd = (args.cwd as string) || ctx.workspacePath;

    const tmpFile = `/tmp/davex_run_${Date.now()}.${getExtension(lang)}`;
    const { default: fs } = await import('fs-extra');
    await fs.writeFile(tmpFile, code, 'utf-8');

    try {
      const runtime = getRuntimeCommand(lang);
      const result = await execa(runtime, [tmpFile], {
        cwd,
        timeout: 30_000,
        all: true,
        reject: false,
      });

      const output = result.all || '';
      return output.slice(0, 8000) || '(no output)';
    } finally {
      const { default: fs } = await import('fs-extra');
      await fs.remove(tmpFile).catch(() => {});
    }
  }
);

registerTool(
  {
    name: 'start_server',
    description: 'Start a local development server (npm start, python -m http.server, etc.) and get the URL. The server runs in the background.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to start the server e.g. "npm start", "python -m http.server 3000"' },
        port: { type: 'number', description: 'Port to use (auto-selected if not specified)' },
        cwd: { type: 'string', description: 'Working directory' },
        name: { type: 'string', description: 'Name to identify this server' },
      },
      required: ['command'],
    },
  },
  async (args, ctx) => {
    const command = args.command as string;
    const cwd = (args.cwd as string) || ctx.workspacePath;
    const name = (args.name as string) || 'server';
    const port = (args.port as number) || await getPort({ port: [3000, 3001, 4000, 5000, 8080, 8000] });

    // Replace port placeholder if present
    const finalCommand = command.replace(/\{PORT\}/g, String(port));

    const child = execa('bash', ['-c', finalCommand], {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PORT: String(port) },
    });
    child.unref();

    runningServers.set(name, { pid: child.pid!, port, command: finalCommand });

    // Wait a bit for it to start
    await new Promise(r => setTimeout(r, 2000));

    return `Server "${name}" started!\n🌐 URL: http://localhost:${port}\nPID: ${child.pid}\nCommand: ${finalCommand}`;
  }
);

registerTool(
  {
    name: 'list_servers',
    description: 'List all running background servers.',
    parameters: { type: 'object', properties: {} },
  },
  async () => {
    if (runningServers.size === 0) return 'No servers running.';
    const lines = Array.from(runningServers.entries()).map(
      ([name, { pid, port, command }]) =>
        `• ${name}: http://localhost:${port} (PID: ${pid})\n  Command: ${command}`
    );
    return lines.join('\n');
  }
);

registerTool(
  {
    name: 'stop_server',
    description: 'Stop a running background server.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name or PID' },
      },
      required: ['name'],
    },
  },
  async (args) => {
    const name = args.name as string;
    const server = runningServers.get(name);
    if (!server) return `Server "${name}" not found.`;
    try {
      const { default: treeKill } = await import('tree-kill');
      await new Promise<void>((resolve, reject) => {
        treeKill(server.pid, 'SIGTERM', (err) => {
          if (err) reject(err); else resolve();
        });
      });
      runningServers.delete(name);
      return `Server "${name}" stopped.`;
    } catch (err: any) {
      return `Error stopping server: ${err.message}`;
    }
  }
);

registerTool(
  {
    name: 'install_packages',
    description: 'Install npm/pip/other packages.',
    parameters: {
      type: 'object',
      properties: {
        packages: { type: 'array', items: { type: 'string' }, description: 'Package names to install' },
        manager: { type: 'string', enum: ['npm', 'pip', 'pip3', 'yarn', 'pnpm', 'bun', 'cargo', 'gem'], description: 'Package manager' },
        cwd: { type: 'string', description: 'Working directory' },
      },
      required: ['packages', 'manager'],
    },
  },
  async (args, ctx) => {
    const packages = args.packages as string[];
    const manager = args.manager as string;
    const cwd = (args.cwd as string) || ctx.workspacePath;

    const commands: Record<string, string> = {
      npm: `npm install ${packages.join(' ')}`,
      pip: `pip install ${packages.join(' ')}`,
      pip3: `pip3 install ${packages.join(' ')}`,
      yarn: `yarn add ${packages.join(' ')}`,
      pnpm: `pnpm add ${packages.join(' ')}`,
      bun: `bun add ${packages.join(' ')}`,
      cargo: `cargo add ${packages.join(' ')}`,
      gem: `gem install ${packages.join(' ')}`,
    };

    const cmd = commands[manager];
    const result = await execa('bash', ['-c', cmd], { cwd, timeout: 120_000, all: true, reject: false });
    return (result.all || '').slice(0, 5000);
  }
);

function getExtension(lang: string): string {
  const map: Record<string, string> = {
    node: 'js',
    python: 'py',
    python3: 'py',
    bash: 'sh',
    ruby: 'rb',
    deno: 'ts',
    bun: 'ts',
  };
  return map[lang] ?? 'txt';
}

function getRuntimeCommand(lang: string): string {
  const map: Record<string, string> = {
    node: 'node',
    python: 'python',
    python3: 'python3',
    bash: 'bash',
    ruby: 'ruby',
    deno: 'deno run',
    bun: 'bun run',
  };
  return map[lang] ?? lang;
}
