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

export function addMcpServer(name: string, opts: { url?: string; command?: string; args?: string[] }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO mcp_servers (id, name, url, command, args, enabled)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(uuidv4(), name, opts.url ?? null, opts.command ?? null, opts.args ? JSON.stringify(opts.args) : null);
}

export function listMcpServers(): McpServerConfig[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM mcp_servers').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    url: r.url,
    command: r.command,
    args: r.args ? JSON.parse(r.args) : undefined,
    enabled: r.enabled === 1,
  }));
}

export function removeMcpServer(name: string): void {
  const db = getDb();
  db.prepare('DELETE FROM mcp_servers WHERE name = ?').run(name);
}

export function toggleMcpServer(name: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE mcp_servers SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name);
}

// Connects to configured MCP servers at startup, same pattern as OpenClaw/Gemini CLI:
// - "url" type servers connect over SSE/HTTP
// - "command" type servers spawn a local stdio process
export async function connectMcpServers(): Promise<void> {
  const servers = listMcpServers().filter(s => s.enabled);
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
