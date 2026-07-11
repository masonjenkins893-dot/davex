import { v4 as uuidv4 } from 'uuid';
import { streamChatCompletion } from '../providers/client.js';
import { getToolDefinitions, executeTool } from '../tools/registry.js';
import { buildSystemPrompt } from './system-prompt.js';
import { getDb } from '../storage/db.js';
import { getActiveProvider } from '../providers/registry.js';
import { MAX_AGENT_ITERATIONS } from '../config/constants.js';
import type {
  AgentTask,
  AgentLoopResult,
  Message,
  ToolCall,
  Todo,
  AgentContext,
} from './types.js';

const QUESTION_TOOL: import('./types.js').ToolDefinition = {
  name: 'ask_user',
  description: 'Ask the user a question when you need information to continue. The loop will pause until they answer.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask the user' },
      reason: { type: 'string', description: 'Why you need this information' },
    },
    required: ['question'],
  },
};

const COMPLETE_TOOL: import('./types.js').ToolDefinition = {
  name: 'task_complete',
  description: 'Call this when the task is fully done to end the loop.',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Summary of what was accomplished' },
      result: { type: 'string', description: 'The final result or output' },
    },
    required: ['summary'],
  },
};

const WRITE_TODOS_TOOL: import('./types.js').ToolDefinition = {
  name: 'write_todos',
  description: 'Update your task todo list to track progress.',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled', 'blocked'] },
          },
          required: ['id', 'content', 'status'],
        },
      },
    },
    required: ['todos'],
  },
};

export async function runAgentLoop(task: AgentTask): Promise<AgentLoopResult> {
  const db = getDb();
  const { context } = task;
  const sessionId = context.sessionId;
  const systemPrompt = buildSystemPrompt(context);
  const toolDefs = [...getToolDefinitions(context), QUESTION_TOOL, COMPLETE_TOOL, WRITE_TODOS_TOOL];

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task.userMessage },
  ];

  let iterations = 0;
  let done = false;
  let finalOutput = '';
  let todos: Todo[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // Save user message
  db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
    uuidv4(), sessionId, 'user', task.userMessage
  );

  while (!done && iterations < MAX_AGENT_ITERATIONS) {
    if (task.abortSignal?.aborted) break;
    iterations++;

    let assistantContent = '';

    try {
      const response = await streamChatCompletion(
        messages,
        toolDefs,
        (chunk) => {
          assistantContent += chunk;
          task.onProgress?.(chunk);
        }
      );

      totalUsage.promptTokens += response.usage.promptTokens;
      totalUsage.completionTokens += response.usage.completionTokens;
      totalUsage.totalTokens += response.usage.totalTokens;

      // Add assistant message to history
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.content || assistantContent,
        toolCalls: response.toolCalls,
      };
      messages.push(assistantMsg);

      // Save to DB
      db.prepare('INSERT INTO messages (id, session_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?)').run(
        uuidv4(), sessionId, 'assistant',
        response.content || assistantContent,
        response.toolCalls ? JSON.stringify(response.toolCalls) : null
      );

      // No tool calls = done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalOutput = response.content || assistantContent;
        done = true;
        break;
      }

      // Process tool calls
      for (const toolCall of response.toolCalls) {
        if (task.abortSignal?.aborted) break;

        const result = await handleToolCall(toolCall, task, todos, context);

        if (result.isDone) {
          finalOutput = result.output;
          done = true;
          break;
        }

        if (result.isTodosUpdate) {
          todos = result.todos ?? todos;
        }

        messages.push({
          role: 'tool',
          content: result.output,
          toolCallId: toolCall.id,
          name: toolCall.name,
        });

        // Save tool result
        db.prepare('INSERT INTO tool_results (id, session_id, tool_name, input, output) VALUES (?, ?, ?, ?, ?)').run(
          uuidv4(), sessionId, toolCall.name,
          JSON.stringify(toolCall.arguments),
          result.output
        );
      }

    } catch (err: any) {
      const errorMsg = `Error: ${err.message}`;
      task.onProgress?.(`\n⚠️ ${errorMsg}\n`);
      messages.push({ role: 'user', content: `Tool error: ${errorMsg}. Please try a different approach.` });
      if (iterations >= 3 && err.message.includes('provider')) break;
    }
  }

  // Save usage
  const provider = getActiveProvider();
  if (provider) {
    db.prepare(`
      INSERT INTO usage (id, session_id, provider, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), sessionId, provider.id, provider.model ?? 'unknown',
      totalUsage.promptTokens, totalUsage.completionTokens, totalUsage.totalTokens);
  }

  return {
    success: !task.abortSignal?.aborted,
    output: finalOutput || 'Task completed.',
    todos,
    iterations,
    usage: totalUsage,
  };
}

interface ToolHandleResult {
  output: string;
  isDone: boolean;
  isTodosUpdate: boolean;
  todos?: Todo[];
}

async function handleToolCall(
  toolCall: ToolCall,
  task: AgentTask,
  currentTodos: Todo[],
  ctx: AgentContext
): Promise<ToolHandleResult> {
  const args = toolCall.arguments;

  // Built-in: ask user
  if (toolCall.name === 'ask_user') {
    const question = args.question as string;
    task.onProgress?.(`\n❓ **Question:** ${question}\n`);
    const answer = await task.onQuestion?.(question) ?? 'No answer provided.';
    return { output: answer, isDone: false, isTodosUpdate: false };
  }

  // Built-in: task complete
  if (toolCall.name === 'task_complete') {
    const summary = args.summary as string;
    const result = args.result as string | undefined;
    return {
      output: result ?? summary,
      isDone: true,
      isTodosUpdate: false,
    };
  }

  // Built-in: write todos
  if (toolCall.name === 'write_todos') {
    const newTodos = args.todos as Todo[];
    return { output: 'Todos updated.', isDone: false, isTodosUpdate: true, todos: newTodos };
  }

  // Registered tools
  try {
    const output = await executeTool(toolCall.name, args, ctx);
    return { output, isDone: false, isTodosUpdate: false };
  } catch (err: any) {
    return { output: `Error running ${toolCall.name}: ${err.message}`, isDone: false, isTodosUpdate: false };
  }
}

