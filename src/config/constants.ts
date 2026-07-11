export const DAVEX_VERSION = '1.0.0';
export const DAVEX_AUTHOR = 'Inyang David';
export const DAVEX_COMPANY = 'Sixpert';
export const DAVEX_REPO = 'https://github.com/sixpert/davex';
export const DAVEX_WEBSITE = 'https://sixpert.dev';

export const DAVEX_HOME = `${process.env.HOME}/.davex`;
export const DAVEX_DB_PATH = `${DAVEX_HOME}/davex.db`;
export const DAVEX_CONFIG_PATH = `${DAVEX_HOME}/config.json`;
export const DAVEX_SESSIONS_DIR = `${DAVEX_HOME}/sessions`;
export const DAVEX_SKILLS_DIR = `${DAVEX_HOME}/skills`;
export const DAVEX_EXTENSIONS_DIR = `${DAVEX_HOME}/extensions`;
export const DAVEX_MCP_DIR = `${DAVEX_HOME}/mcp`;
export const DAVEX_MEMORY_DIR = `${DAVEX_HOME}/memory`;
export const DAVEX_STICKER_CACHE = `${DAVEX_HOME}/sticker_cache.json`;

export const MAX_AGENT_ITERATIONS = 100;
export const DEFAULT_MAX_TOKENS = 8192;
export const QUESTION_TIMEOUT_MS = 300_000; // 5 minutes

export const DAVEX_ASCII_LOGO = `
   ██████╗  █████╗ ██╗   ██╗███████╗██╗  ██╗
   ██╔══██╗██╔══██╗██║   ██║██╔════╝╚██╗██╔╝
   ██║  ██║███████║██║   ██║█████╗   ╚███╔╝ 
   ██║  ██║██╔══██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
   ██████╔╝██║  ██║ ╚████╔╝ ███████╗██╔╝ ██╗
   ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝
`;

export const PROVIDERS = [
  { id: 'openai',       name: 'OpenAI',         baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic',    name: 'Anthropic',       baseUrl: 'https://api.anthropic.com' },
  { id: 'gemini',       name: 'Google Gemini',   baseUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'groq',         name: 'Groq',            baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'xai',          name: 'xAI / Grok',      baseUrl: 'https://api.x.ai/v1' },
  { id: 'mistral',      name: 'Mistral',         baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'cohere',       name: 'Cohere',          baseUrl: 'https://api.cohere.ai' },
  { id: 'together',     name: 'Together AI',     baseUrl: 'https://api.together.xyz/v1' },
  { id: 'cerebras',     name: 'Cerebras',        baseUrl: 'https://api.cerebras.ai/v1' },
  { id: 'nvidia',       name: 'Nvidia NIM',      baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'fireworks',    name: 'Fireworks AI',    baseUrl: 'https://api.fireworks.ai/inference/v1' },
  { id: 'hyperbolic',   name: 'Hyperbolic',      baseUrl: 'https://api.hyperbolic.xyz/v1' },
  { id: 'deepinfra',    name: 'DeepInfra',       baseUrl: 'https://api.deepinfra.com/v1/openai' },
  { id: 'openrouter',   name: 'OpenRouter',      baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'huggingface',  name: 'HuggingFace',     baseUrl: 'https://api-inference.huggingface.co' },
  { id: 'perplexity',   name: 'Perplexity',      baseUrl: 'https://api.perplexity.ai' },
  { id: 'qwen',         name: 'Qwen / Alibaba',  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'sambanova',    name: 'SambaNova',       baseUrl: 'https://api.sambanova.ai/v1' },
  { id: 'novita',       name: 'Novita AI',       baseUrl: 'https://api.novita.ai/v3/openai' },
  { id: 'ai21',         name: 'AI21 Labs',       baseUrl: 'https://api.ai21.com/studio/v1' },
  { id: 'monsterapi',   name: 'MonsterAPI',      baseUrl: 'https://api.monsterapi.ai/v1' },
  { id: 'lepton',       name: 'Lepton AI',       baseUrl: 'https://api.lepton.ai/api/v1' },
  { id: 'cloudflare',   name: 'Cloudflare AI',   baseUrl: 'https://api.cloudflare.com/client/v4/accounts' },
  { id: 'replicate',    name: 'Replicate',       baseUrl: 'https://api.replicate.com/v1' },
  { id: 'localmodel',   name: 'Local Model',     baseUrl: 'http://localhost:11434/v1' },
] as const;

export type ProviderId = typeof PROVIDERS[number]['id'];

export const TELEGRAM_BOT_COMMANDS = [
  { command: 'reset',         description: 'Reset current session' },
  { command: 'retry',         description: 'Retry last message' },
  { command: 'undo',          description: 'Undo last action' },
  { command: 'rollback',      description: 'Rollback to checkpoint' },
  { command: 'resume',        description: 'Resume a session' },
  { command: 'sessions',      description: 'List sessions' },
  { command: 'branch',        description: 'Branch current session' },
  { command: 'goal',          description: 'Set a goal' },
  { command: 'subgoal',       description: 'Set a subgoal' },
  { command: 'kanban',        description: 'View task board' },
  { command: 'stop',          description: 'Stop current task' },
  { command: 'background',    description: 'Run task in background' },
  { command: 'yolo',          description: 'Skip confirmations mode' },
  { command: 'fast',          description: 'Fast mode (less verbose)' },
  { command: 'reasoning',     description: 'Toggle reasoning display' },
  { command: 'verbose',       description: 'Toggle verbose output' },
  { command: 'model',         description: 'Switch model' },
  { command: 'personality',   description: 'Set agent personality' },
  { command: 'voice',         description: 'Toggle voice transcription' },
  { command: 'compress',      description: 'Compress context window' },
  { command: 'memory',        description: 'View or clear memory' },
  { command: 'topic',         description: 'Set conversation topic' },
  { command: 'title',         description: 'Set session title' },
  { command: 'status',        description: 'Agent status' },
  { command: 'whoami',        description: 'Bot info' },
  { command: 'profile',       description: 'Your profile' },
  { command: 'agents',        description: 'List agents' },
  { command: 'version',       description: 'DaveX version' },
  { command: 'usage',         description: 'Token usage stats' },
  { command: 'insights',      description: 'Usage insights' },
  { command: 'credits',       description: 'Credits and info' },
  { command: 'skills',        description: 'Manage skills' },
  { command: 'reload_skills', description: 'Reload skills' },
  { command: 'reload_mcp',    description: 'Reload MCP servers' },
  { command: 'bundles',       description: 'List skill bundles' },
  { command: 'approve',       description: 'Approve pairing request' },
  { command: 'deny',          description: 'Deny pairing request' },
  { command: 'debug',         description: 'Debug info' },
  { command: 'update',        description: 'Update DaveX' },
  { command: 'help',          description: 'Show all commands' },
];
