import { getDb } from '../storage/db.js';
import { PROVIDERS, type ProviderId } from '../config/constants.js';
import { getSetting, setSetting } from '../config/settings.js';
import axios from 'axios';

export interface ProviderRecord {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  isActive: boolean;
}

export function listSavedProviders(): ProviderRecord[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM providers').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    apiKey: r.api_key,
    baseUrl: r.base_url,
    model: r.model,
    isActive: r.is_active === 1,
  }));
}

export function saveProvider(id: string, apiKey: string, model: string): void {
  const db = getDb();
  const info = PROVIDERS.find(p => p.id === id);
  if (!info) throw new Error(`Unknown provider: ${id}`);
  db.prepare(`
    INSERT OR REPLACE INTO providers (id, name, api_key, base_url, model)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, info.name, apiKey, info.baseUrl, model);
}

export function setActiveProvider(providerId: string, model: string): void {
  const db = getDb();
  db.prepare('UPDATE providers SET is_active = 0').run();
  db.prepare('UPDATE providers SET is_active = 1, model = ? WHERE id = ?').run(model, providerId);
  setSetting('activeProvider', providerId);
  setSetting('activeModel', model);
}

export function getActiveProvider(): ProviderRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM providers WHERE is_active = 1').get() as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    model: row.model,
    isActive: true,
  };
}

export async function fetchModels(providerId: string, apiKey: string): Promise<string[]> {
  try {
    switch (providerId) {
      case 'openai':
        return await fetchOpenAIModels(apiKey);
      case 'anthropic':
        return getAnthropicModels();
      case 'gemini':
        return await fetchGeminiModels(apiKey);
      case 'groq':
        return await fetchGroqModels(apiKey);
      case 'xai':
        return await fetchXAIModels(apiKey);
      case 'mistral':
        return await fetchMistralModels(apiKey);
      case 'cohere':
        return getDefaultModels('cohere');
      case 'together':
        return await fetchTogetherModels(apiKey);
      case 'cerebras':
        return await fetchCerebrasModels(apiKey);
      case 'nvidia':
        return await fetchOpenAICompatibleModels('https://integrate.api.nvidia.com/v1', apiKey);
      case 'fireworks':
        return await fetchOpenAICompatibleModels('https://api.fireworks.ai/inference/v1', apiKey);
      case 'hyperbolic':
        return await fetchOpenAICompatibleModels('https://api.hyperbolic.xyz/v1', apiKey);
      case 'deepinfra':
        return await fetchOpenAICompatibleModels('https://api.deepinfra.com/v1/openai', apiKey);
      case 'openrouter':
        return await fetchOpenRouterModels(apiKey);
      case 'perplexity':
        return getPerplexityModels();
      case 'sambanova':
        return await fetchOpenAICompatibleModels('https://api.sambanova.ai/v1', apiKey);
      case 'novita':
        return await fetchOpenAICompatibleModels('https://api.novita.ai/v3/openai', apiKey);
      case 'lepton':
        return await fetchOpenAICompatibleModels('https://api.lepton.ai/api/v1', apiKey);
      case 'localmodel':
        return await fetchOllamaModels();
      default:
        return getDefaultModels(providerId);
    }
  } catch {
    return getDefaultModels(providerId);
  }
}

async function fetchOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await axios.get(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 10000,
  });
  return res.data.data
    .map((m: any) => m.id as string)
    .filter((id: string) => !id.includes('embed') && !id.includes('whisper'))
    .slice(0, 30);
}

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const models = await fetchOpenAICompatibleModels('https://api.openai.com/v1', apiKey);
  return models.filter(m => m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4'));
}

function getAnthropicModels(): string[] {
  return [
    'claude-fable-5',
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ];
}

async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  const res = await axios.get(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { timeout: 10000 }
  );
  return res.data.models
    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: any) => m.name.replace('models/', ''));
}

async function fetchGroqModels(apiKey: string): Promise<string[]> {
  return fetchOpenAICompatibleModels('https://api.groq.com/openai/v1', apiKey);
}

async function fetchXAIModels(apiKey: string): Promise<string[]> {
  return fetchOpenAICompatibleModels('https://api.x.ai/v1', apiKey);
}

async function fetchMistralModels(apiKey: string): Promise<string[]> {
  const res = await axios.get('https://api.mistral.ai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 10000,
  });
  return res.data.data.map((m: any) => m.id);
}

async function fetchTogetherModels(apiKey: string): Promise<string[]> {
  const res = await axios.get('https://api.together.xyz/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 10000,
  });
  return res.data
    .filter((m: any) => m.type === 'chat')
    .map((m: any) => m.id)
    .slice(0, 30);
}

async function fetchCerebrasModels(apiKey: string): Promise<string[]> {
  return fetchOpenAICompatibleModels('https://api.cerebras.ai/v1', apiKey);
}

async function fetchOpenRouterModels(apiKey: string): Promise<string[]> {
  const res = await axios.get('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 10000,
  });
  return res.data.data.map((m: any) => m.id).slice(0, 50);
}

async function fetchOllamaModels(): Promise<string[]> {
  try {
    const res = await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
    return res.data.models.map((m: any) => m.name);
  } catch {
    return ['llama3.2', 'mistral', 'codellama', 'deepseek-coder'];
  }
}

function getPerplexityModels(): string[] {
  return [
    'sonar-pro',
    'sonar',
    'sonar-reasoning-pro',
    'sonar-reasoning',
    'sonar-deep-research',
  ];
}

function getDefaultModels(providerId: string): string[] {
  const defaults: Record<string, string[]> = {
    cohere:     ['command-r-plus', 'command-r', 'command'],
    huggingface:['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    qwen:       ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    ai21:       ['jamba-1.5-large', 'jamba-1.5-mini'],
    monsterapi: ['llama-3.1-405b', 'gemma-2-27b'],
    cloudflare: ['@cf/meta/llama-3.1-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.1'],
    replicate:  ['meta/llama-3-70b-instruct', 'mistralai/mixtral-8x7b-instruct-v0.1'],
  };
  return defaults[providerId] ?? ['default'];
}
