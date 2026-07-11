import fs from 'fs-extra';
import path from 'path';
import { registerTool } from './registry.js';

registerTool(
  {
    name: 'insert_lines',
    description: 'Insert lines into a file at a specific line number.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        line: { type: 'number', description: 'Line number to insert after (0 = start of file)' },
        content: { type: 'string', description: 'Content to insert' },
      },
      required: ['path', 'line', 'content'],
    },
  },
  async (args, ctx) => {
    const filePath = path.isAbsolute(args.path as string)
      ? args.path as string
      : path.resolve(ctx.workspacePath, args.path as string);

    if (!await fs.pathExists(filePath)) return `File not found: ${filePath}`;

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const insertAt = args.line as number;
    const newLines = (args.content as string).split('\n');

    lines.splice(insertAt, 0, ...newLines);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    return `Inserted ${newLines.length} lines at line ${insertAt} in ${filePath}`;
  }
);

registerTool(
  {
    name: 'delete_lines',
    description: 'Delete specific lines from a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        start_line: { type: 'number', description: 'First line to delete (1-indexed)' },
        end_line: { type: 'number', description: 'Last line to delete (1-indexed)' },
      },
      required: ['path', 'start_line', 'end_line'],
    },
  },
  async (args, ctx) => {
    const filePath = path.isAbsolute(args.path as string)
      ? args.path as string
      : path.resolve(ctx.workspacePath, args.path as string);

    if (!await fs.pathExists(filePath)) return `File not found: ${filePath}`;

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = (args.start_line as number) - 1;
    const end = args.end_line as number;
    const deleted = end - start;

    lines.splice(start, deleted);
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    return `Deleted lines ${args.start_line}-${args.end_line} from ${filePath}`;
  }
);
