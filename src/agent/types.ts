export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface AgentContext {
  sessionId: string;
  workspacePath: string;
  platform: 'terminal' | 'telegram';
  chatId?: string;
  yoloMode: boolean;
  fastMode: boolean;
  verboseMode: boolean;
  reasoningMode: boolean;
  planMode: boolean;
  personality?: string;
}

export interface AgentTask {
  id: string;
  userMessage: string;
  context: AgentContext;
  onProgress?: (text: string) => void;
  onQuestion?: (question: string) => Promise<string>;
  onDone?: (result: string) => void;
  onError?: (error: string) => void;
  abortSignal?: AbortSignal;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface AgentLoopResult {
  success: boolean;
  output: string;
  todos: Todo[];
  iterations: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}
