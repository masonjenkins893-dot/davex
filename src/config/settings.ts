import fs from 'fs-extra';
import { DAVEX_CONFIG_PATH, DAVEX_HOME } from './constants.js';

export interface DaveXSettings {
  // Workspace
  workspacePath?: string;
  workspaceApproved?: boolean;

  // Supabase (bootstrap credentials — must live locally, since DaveX needs
  // these before it can reach Supabase at all)
  supabaseUrl?: string;
  supabaseServiceKey?: string;

  // Telegram
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramEnabled?: boolean;

  // Provider
  activeProvider?: string;
  activeModel?: string;

  // Voice
  groqApiKeyForWhisper?: string;
  voiceEnabled?: boolean;

  // Agent
  yoloMode?: boolean;
  fastMode?: boolean;
  verboseMode?: boolean;
  reasoningMode?: boolean;
  planMode?: boolean;
  personality?: string;

  // Memory
  longTermMemoryEnabled?: boolean;

  // Misc
  theme?: string;
  footer?: string;
  firstRun?: boolean;
}

let _cache: DaveXSettings | null = null;

function loadSettings(): DaveXSettings {
  if (_cache) return _cache;
  fs.ensureDirSync(DAVEX_HOME);
  if (!fs.pathExistsSync(DAVEX_CONFIG_PATH)) {
    _cache = {};
    return _cache;
  }
  try {
    _cache = fs.readJsonSync(DAVEX_CONFIG_PATH) as DaveXSettings;
  } catch {
    _cache = {};
  }
  return _cache;
}

function persist(settings: DaveXSettings): void {
  fs.ensureDirSync(DAVEX_HOME);
  fs.writeJsonSync(DAVEX_CONFIG_PATH, settings, { spaces: 2 });
}

export function getSetting<K extends keyof DaveXSettings>(key: K): DaveXSettings[K] | undefined {
  return loadSettings()[key];
}

export function setSetting<K extends keyof DaveXSettings>(key: K, value: DaveXSettings[K]): void {
  const settings = loadSettings();
  settings[key] = value;
  persist(settings);

  // Keep process.env in sync so storage/db.ts can pick up Supabase
  // credentials the moment they're set, without a restart.
  if (key === 'supabaseUrl' && typeof value === 'string') {
    process.env.DAVEX_SUPABASE_URL = value;
  }
  if (key === 'supabaseServiceKey' && typeof value === 'string') {
    process.env.DAVEX_SUPABASE_SERVICE_KEY = value;
  }
}

export function isFirstRun(): boolean {
  const val = getSetting('firstRun');
  return val === undefined || val === true;
}

export function markSetupDone(): void {
  setSetting('firstRun', false);
}

/** Call once at startup so getDb() has credentials available immediately. */
export function hydrateEnvFromSettings(): void {
  const url = getSetting('supabaseUrl');
  const key = getSetting('supabaseServiceKey');
  if (url) process.env.DAVEX_SUPABASE_URL = url;
  if (key) process.env.DAVEX_SUPABASE_SERVICE_KEY = key;
}
