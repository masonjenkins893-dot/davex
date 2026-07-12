import { getActiveProvider } from './registry.js';
import type { Message, ToolDefinition, LLMResponse } from '../agent/types.js';

export async function chatCompletion(
  messages: Message[],
  tools?: ToolDefinition[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const provider = await getActiveProvider();
  if (!provider) throw new Error('No provider configured. Run /providers to set one up.');

  const { id, apiKey, model, baseUrl } = provider;

  switch (id) {
    case 'anthropic':
      return callAnthropic(messages, tools, apiKey, model!, options);
    case 'gemini':
      return callGemini(messages, tools, apiKey, model!, options);
    default:
      return callOpenAICompatible(messages, tools, apiKey, model!, baseUrl!, options);
  }
}

async function callOpenAICompatible(
  messages: Message[],
  tools: ToolDefinition[] | undefined,
  apiKey: string,
  model: string,
  baseUrl: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, baseURL: baseUrl });

  const oaiMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system' | 'tool',
    content: m.content,
    tool_call_id: m.toolCallId,
    tool_calls: m.toolCalls,
    name: m.name,
  }));

  const oaiTools = tools?.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const res = await client.chat.completions.create({
    model,
    messages: oaiMessages as any,
    tools: oaiTools,
    max_tokens: options?.maxTokens ?? 8192,
    temperature: options?.temperature ?? 0.7,
  });

  const choice = res.choices[0];
  return {
    content: choice.message.content ?? '',
    toolCalls: choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    })),
    usage: {
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0,
    },
    finishReason: choice.finish_reason ?? 'stop',
  };
}

async function callAnthropic(
  messages: Message[],
  tools: ToolDefinition[] | undefined,
  apiKey: string,
  model: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const anthropicMessages = chatMessages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.toolCalls
      ? m.toolCalls.map(tc => ({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        }))
      : m.toolCallId
      ? [{ type: 'tool_result' as const, tool_use_id: m.toolCallId, content: m.content }]
      : m.content,
  }));

  const anthropicTools = tools?.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const res = await client.messages.create({
    model,
    system: systemMsg?.content as string | undefined,
    messages: anthropicMessages as any,
    tools: anthropicTools as any,
    max_tokens: options?.maxTokens ?? 8192,
  });

  const textBlock = res.content.find(b => b.type === 'text');
  const toolBlocks = res.content.filter(b => b.type === 'tool_use') as any[];

  return {
    content: textBlock?.type === 'text' ? textBlock.text : '',
    toolCalls: toolBlocks.map(b => ({
      id: b.id,
      name: b.name,
      arguments: b.input,
    })),
    usage: {
      promptTokens: res.usage.input_tokens,
      completionTokens: res.usage.output_tokens,
      totalTokens: res.usage.input_tokens + res.usage.output_tokens,
    },
    finishReason: res.stop_reason ?? 'stop',
  };
}

async function callGemini(
  messages: Message[],
  tools: ToolDefinition[] | undefined,
  apiKey: string,
  model: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const systemMsg = messages.find(m => m.role === 'system');
  const history = messages.filter(m => m.role !== 'system').slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content as string }],
  }));

  const lastMessage = messages[messages.length - 1];
  const chat = ai.chats.create({
    model,
    history: history as any,
    config: {
      systemInstruction: systemMsg?.content as string | undefined,
      maxOutputTokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.7,
    },
  });

  const result = await chat.sendMessage({ message: lastMessage.content as string });
  const text = result.text ?? '';

  return {
    content: text,
    toolCalls: [],
    usage: {
      promptTokens: result.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: result.usageMetadata?.totalTokenCount ?? 0,
    },
    finishReason: 'stop',
  };
}

export async function streamChatCompletion(
  messages: Message[],
  tools?: ToolDefinition[],
  onChunk?: (chunk: string) => void,
  options?: { maxTokens?: number }
): Promise<LLMResponse> {
  const provider = await getActiveProvider();
  if (!provider) throw new Error('No provider configured.');

  const { id, apiKey, model, baseUrl } = provider;

  if (id === 'anthropic') {
    return streamAnthropic(messages, tools, apiKey, model!, onChunk, options);
  }
  return streamOpenAICompatible(messages, tools, apiKey, model!, baseUrl!, onChunk, options);
}

async function streamOpenAICompatible(
  messages: Message[],
  tools: ToolDefinition[] | undefined,
  apiKey: string,
  model: string,
  baseUrl: string,
  onChunk?: (chunk: string) => void,
  options?: { maxTokens?: number }
): Promise<LLMResponse> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, baseURL: baseUrl });

  const stream = await client.chat.completions.create({
    model,
    messages: messages as any,
    tools: tools?.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
    max_tokens: options?.maxTokens ?? 8192,
    stream: true,
  });

  let fullContent = '';
  const toolCallsMap: Map<number, any> = new Map();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      fullContent += delta.content;
      onChunk?.(delta.content);
    }
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!toolCallsMap.has(tc.index)) {
          toolCallsMap.set(tc.index, { id: tc.id, name: tc.function?.name ?? '', arguments: '' });
        }
        const existing = toolCallsMap.get(tc.index);
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.id) existing.id = tc.id;
      }
    }
  }

  const toolCalls = Array.from(toolCallsMap.values()).map(tc => ({
    id: tc.id,
    name: tc.name,
    arguments: (() => { try { return JSON.parse(tc.arguments); } catch { return {}; } })(),
  }));

  return {
    content: fullContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
  };
}

async function streamAnthropic(
  messages: Message[],
  tools: ToolDefinition[] | undefined,
  apiKey: string,
  model: string,
  onChunk?: (chunk: string) => void,
  options?: { maxTokens?: number }
): Promise<LLMResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const stream = await client.messages.stream({
    model,
    system: systemMsg?.content as string | undefined,
    messages: chatMessages as any,
    tools: tools?.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })) as any,
    max_tokens: options?.maxTokens ?? 8192,
  });

  let fullContent = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullContent += event.delta.text;
      onChunk?.(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  const toolBlocks = final.content.filter(b => b.type === 'tool_use') as any[];

  return {
    content: fullContent,
    toolCalls: toolBlocks.map(b => ({ id: b.id, name: b.name, arguments: b.input })),
    usage: {
      promptTokens: final.usage.input_tokens,
      completionTokens: final.usage.output_tokens,
      totalTokens: final.usage.input_tokens + final.usage.output_tokens,
    },
    finishReason: final.stop_reason ?? 'stop',
  };
}
