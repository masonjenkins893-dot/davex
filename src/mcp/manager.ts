import { getDb } from '../storage/db.js';
import { v4 as uuidv4 } from 'uuid';

export interface McpServerConfig {
  id: string;
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
}

export async function addMcpServer(name: string, opts: { url?: string; command?: string; args?: string[] }): Promise<void> {
  const db = getDb();
  await db.from('mcp_servers').insert({
    id: uuidv4(), name, url: opts.url ?? null, command: opts.command ?? null,
    args: opts.args ?? null, enabled: true,
  });
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  const db = getDb();
  const { data, error } = await db.from('mcp_servers').select('*');
  if (error) throw new Error(`listMcpServers failed: ${error.message}`);
  return (data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    url: r.url,
    command: r.command,
    args: r.args ?? undefined,
    enabled: r.enabled === true,
  }));
}

export async function removeMcpServer(name: string): Promise<void> {
  const db = getDb();
  await db.from('mcp_servers').delete().eq('name', name);
}

export async function toggleMcpServer(name: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db.from('mcp_servers').update({ enabled }).eq('name', name);
}

// Connects to configured MCP servers at startup, same pattern as OpenClaw/Gemini CLI:
// - "url" type servers connect over SSE/HTTP
// - "command" type servers spawn a local stdio process
export async function connectMcpServers(): Promise<void> {
  const servers = (await listMcpServers()).filter(s => s.enabled);
  for (const server of servers) {
    try {
      if (server.url) {
        console.log(`🔌 Connecting to MCP server "${server.name}" at ${server.url}`);
      } else if (server.command) {
        console.log(`🔌 Starting MCP server "${server.name}": ${server.command} ${(server.args ?? []).join(' ')}`);
      }
      // Actual MCP SDK client connection happens here when @modelcontextprotocol/sdk is wired in
    } catch (err: any) {
      console.error(`Failed to connect MCP server "${server.name}": ${err.message}`);
    }
  }
}
