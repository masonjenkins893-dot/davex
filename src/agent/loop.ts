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

  // Save user message (best-effort — a DB hiccup shouldn't kill the loop)
  await db.from('messages').insert({
    id: uuidv4(), session_id: sessionId, role: 'user', content: task.userMessage,
  }).then(({ error }) => { if (error) console.error('Failed to save user message:', error.message); });

  while (!done && iterations < MAX_AGENT_ITERATIONS) {
    if (task.abortSignal?.aborted) break;
    iterations++;

    let assistantContent = '';

    try {
      task.onProgress?.(`\n🧠 Thinking (step ${iterations})...\n`);

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

      // Save to DB (best-effort)
      db.from('messages').insert({
        id: uuidv4(), session_id: sessionId, role: 'assistant',
        content: response.content || assistantContent,
        tool_calls: response.toolCalls ?? null,
      }).then(({ error }) => { if (error) console.error('Failed to save assistant message:', error.message); });

      // No tool calls = done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalOutput = response.content || assistantContent;
        done = true;
        break;
      }

      // Process tool calls — visibly, so the terminal/telegram shows what's happening
      for (const toolCall of response.toolCalls) {
        if (task.abortSignal?.aborted) break;

        if (toolCall.name !== 'ask_user' && toolCall.name !== 'task_complete' && toolCall.name !== 'write_todos') {
          const argsPreview = JSON.stringify(toolCall.arguments);
          const shortArgs = argsPreview.length > 200 ? argsPreview.slice(0, 200) + '…' : argsPreview;
          task.onProgress?.(`\n🔧 Running ${toolCall.name}(${shortArgs})\n`);
        }

        const result = await handleToolCall(toolCall, task, todos, context);

        if (toolCall.name !== 'ask_user' && toolCall.name !== 'task_complete' && toolCall.name !== 'write_todos') {
          const outPreview = result.output.length > 300 ? result.output.slice(0, 300) + '…' : result.output;
          task.onProgress?.(`   ↳ ${outPreview}\n`);
        }

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

        // Save tool result (best-effort)
        db.from('tool_results').insert({
          id: uuidv4(), session_id: sessionId, tool_name: toolCall.name,
          input: JSON.stringify(toolCall.arguments),
          output: result.output,
        }).then(({ error }) => { if (error) console.error('Failed to save tool result:', error.message); });
      }

    } catch (err: any) {
      const errorMsg = `Error: ${err.message}`;
      task.onProgress?.(`\n⚠️ ${errorMsg}\n`);
      messages.push({ role: 'user', content: `Tool error: ${errorMsg}. Please try a different approach.` });
      if (iterations >= 3 && err.message.includes('provider')) break;
    }
  }

  // Save usage (best-effort)
  const provider = await getActiveProvider();
  if (provider) {
    const { error } = await db.from('usage').insert({
      id: uuidv4(), session_id: sessionId, provider: provider.id, model: provider.model ?? 'unknown',
      prompt_tokens: totalUsage.promptTokens,
      completion_tokens: totalUsage.completionTokens,
      total_tokens: totalUsage.totalTokens,
    });
    if (error) console.error('Failed to save usage:', error.message);
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

