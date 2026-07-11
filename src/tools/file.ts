import fs from 'fs-extra';
import path from 'path';
import { registerTool } from './registry.js';
import type { AgentContext } from '../agent/types.js';

// Read file
registerTool(
  {
    name: 'read_file',
    description: 'Read the contents of a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file (relative to workspace or absolute)' },
        start_line: { type: 'number', description: 'Start line (1-indexed)' },
        end_line: { type: 'number', description: 'End line (1-indexed)' },
      },
      required: ['path'],
    },
  },
  async (args, ctx) => {
    const filePath = resolvePath(args.path as string, ctx.workspacePath);
    if (!await fs.pathExists(filePath)) return `File not found: ${filePath}`;

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const start = (args.start_line as number | undefined) ?? 1;
    const end = (args.end_line as number | undefined) ?? lines.length;
    const slice = lines.slice(start - 1, end);

    const numbered = slice.map((l, i) => `${start + i}\t${l}`).join('\n');
    if (numbered.length > 15_000) return numbered.slice(0, 15_000) + '\n...(truncated)';
    return numbered;
  }
);

// Write file
registerTool(
  {
    name: 'write_file',
    description: 'Write content to a file. Creates directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  async (args, ctx) => {
    const filePath = resolvePath(args.path as string, ctx.workspacePath);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, args.content as string, 'utf-8');
    return `Written: ${filePath}`;
  }
);

// Edit file (replace a specific string)
registerTool(
  {
    name: 'edit_file',
    description: 'Replace a specific string in a file. old_str must match exactly once.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
        old_str: { type: 'string', description: 'The exact string to find and replace' },
        new_str: { type: 'string', description: 'The replacement string' },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },
  async (args, ctx) => {
    const filePath = resolvePath(args.path as string, ctx.workspacePath);
    if (!await fs.pathExists(filePath)) return `File not found: ${filePath}`;

    const content = await fs.readFile(filePath, 'utf-8');
    const oldStr = args.old_str as string;
    const newStr = args.new_str as string;

    const count = content.split(oldStr).length - 1;
    if (count === 0) return `String not found in file: ${oldStr}`;
    if (count > 1) return `String found ${count} times — must match exactly once. Be more specific.`;

    await fs.writeFile(filePath, content.replace(oldStr, newStr), 'utf-8');
    return `Edited: ${filePath}`;
  }
);

// Read many files
registerTool(
  {
    name: 'read_many_files',
    description: 'Read multiple files at once.',
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'List of file paths' },
      },
      required: ['paths'],
    },
  },
  async (args, ctx) => {
    const paths = args.paths as string[];
    const results: string[] = [];
    for (const p of paths) {
      const filePath = resolvePath(p, ctx.workspacePath);
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        results.push(`=== ${p} ===\n${content.slice(0, 5000)}`);
      } else {
        results.push(`=== ${p} ===\n(not found)`);
      }
    }
    return results.join('\n\n');
  }
);

// Delete file
registerTool(
  {
    name: 'delete_file',
    description: 'Delete a file or directory.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to delete' },
        recursive: { type: 'boolean', description: 'Delete directory recursively' },
      },
      required: ['path'],
    },
  },
  async (args, ctx) => {
    const filePath = resolvePath(args.path as string, ctx.workspacePath);
    if (!await fs.pathExists(filePath)) return `Not found: ${filePath}`;
    if (args.recursive) {
      await fs.remove(filePath);
    } else {
      await fs.unlink(filePath);
    }
    return `Deleted: ${filePath}`;
  }
);

function resolvePath(p: string, workspace: string): string {
  return path.isAbsolute(p) ? p : path.resolve(workspace, p);
}
