import type { ToolDefinition, AgentContext } from '../agent/types.js';

type ToolHandler = (args: Record<string, unknown>, ctx: AgentContext) => Promise<string>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

const toolRegistry = new Map<string, RegisteredTool>();

export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
  toolRegistry.set(definition.name, { definition, handler });
}

export function getToolDefinitions(_ctx?: AgentContext): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map(t => t.definition);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext
): Promise<string> {
  const tool = toolRegistry.get(name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool.handler(args, ctx);
}

// Auto-register all tools
export async function initTools(): Promise<void> {
  await import('./bash.js');
  await import('./file.js');
  await import('./grep.js');
  await import('./glob.js');
  await import('./web-fetch.js');
  await import('./web-search.js');
  await import('./code-runner.js');
  await import('./edit.js');
  await import('./ls.js');
  await import('./schedule.js');
}
