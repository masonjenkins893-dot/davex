import { createInterface } from 'readline';
import { runAgentLoop } from '../agent/loop.js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentContext } from '../agent/types.js';

// JSON-RPC 2.0 over stdio, same pattern Gemini CLI and Grok CLI use to talk to
// editor extensions (VS Code, etc.)
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: { code: number; message: string };
}

export function startAcpServer(workspacePath: string): void {
  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on('line', async (line) => {
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }

    const response = await handleAcpMethod(req, workspacePath);
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  });
}

async function handleAcpMethod(req: JsonRpcRequest, workspacePath: string): Promise<JsonRpcResponse | null> {
  switch (req.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { name: 'davex', version: '1.0.0', capabilities: { streaming: true, tools: true } },
      };

    case 'session/new': {
      const sessionId = uuidv4();
      return { jsonrpc: '2.0', id: req.id, result: { sessionId } };
    }

    case 'session/prompt': {
      const { sessionId, prompt } = req.params;
      const ctx: AgentContext = {
        sessionId,
        workspacePath,
        platform: 'terminal',
        yoloMode: false,
        fastMode: false,
        verboseMode: false,
        reasoningMode: false,
        planMode: false,
      };

      const result = await runAgentLoop({
        id: uuidv4(),
        userMessage: prompt,
        context: ctx,
        onProgress: (chunk) => {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: { sessionId, chunk },
          }) + '\n');
        },
      });

      return { jsonrpc: '2.0', id: req.id, result: { output: result.output } };
    }

    default:
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } };
  }
}
