import fs from 'fs-extra';
import path from 'path';
import { registerTool } from './registry.js';

registerTool(
  {
    name: 'ls',
    description: 'List files and directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to list' },
        show_hidden: { type: 'boolean', description: 'Show hidden files' },
      },
    },
  },
  async (args, ctx) => {
    const dirPath = path.resolve(ctx.workspacePath, (args.path as string) || '.');
    if (!await fs.pathExists(dirPath)) return `Directory not found: ${dirPath}`;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const showHidden = args.show_hidden as boolean | undefined;

    const filtered = entries
      .filter(e => showHidden || !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    const lines = filtered.map(e => {
      const suffix = e.isDirectory() ? '/' : '';
      return `${e.isDirectory() ? '📁' : '📄'} ${e.name}${suffix}`;
    });

    return `${dirPath}\n${lines.join('\n')}`;
  }
);
