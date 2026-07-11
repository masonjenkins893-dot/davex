import { glob } from 'glob';
import { registerTool } from './registry.js';
import path from 'path';

registerTool(
  {
    name: 'glob',
    description: 'Find files matching a pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern e.g. "**/*.ts", "src/**/*.js"' },
        cwd: { type: 'string', description: 'Directory to search in' },
        ignore: { type: 'array', items: { type: 'string' }, description: 'Patterns to ignore' },
      },
      required: ['pattern'],
    },
  },
  async (args, ctx) => {
    const pattern = args.pattern as string;
    const cwd = (args.cwd as string) || ctx.workspacePath;
    const ignore = (args.ignore as string[]) || ['node_modules/**', '.git/**', 'dist/**'];

    const files = await glob(pattern, { cwd, ignore, absolute: false });
    if (files.length === 0) return 'No files found.';
    return files.slice(0, 200).join('\n');
  }
);
