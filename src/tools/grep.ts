import { execa } from 'execa';
import { registerTool } from './registry.js';

registerTool(
  {
    name: 'grep',
    description: 'Search for text in files using grep or ripgrep.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex supported)' },
        path: { type: 'string', description: 'File or directory to search in' },
        case_insensitive: { type: 'boolean', description: 'Case insensitive search' },
        include: { type: 'string', description: 'File pattern to include e.g. "*.ts"' },
        max_results: { type: 'number', description: 'Max results to return (default 50)' },
      },
      required: ['pattern'],
    },
  },
  async (args, ctx) => {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || ctx.workspacePath;
    const caseFlag = args.case_insensitive ? '-i' : '';
    const includeFlag = args.include ? `--include="${args.include}"` : '';
    const maxResults = (args.max_results as number) || 50;

    // Try ripgrep first, fall back to grep
    const useRg = await commandExists('rg');
    let cmd: string;

    if (useRg) {
      const includeRg = args.include ? `--glob "${args.include}"` : '';
      cmd = `rg ${caseFlag ? '-i' : ''} ${includeRg} -n --max-count ${maxResults} "${pattern}" "${searchPath}" 2>/dev/null | head -${maxResults}`;
    } else {
      cmd = `grep -rn ${caseFlag} ${includeFlag} --max-count=${maxResults} "${pattern}" "${searchPath}" 2>/dev/null | head -${maxResults}`;
    }

    const result = await execa('bash', ['-c', cmd], { reject: false, all: true });
    const output = result.all || '';
    return output.length > 0 ? output : 'No matches found.';
  }
);

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execa('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}
