import { getConfig, setConfig } from '../storage/db.js';
import { DAVEX_CONFIG_PATH } from './constants.js';
import fs from 'fs-extra';

export interface DaveXSettings {
  // Workspace
  workspacePath?: string;
  workspaceApproved?: boolean;

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

export function getSetting<K extends keyof DaveXSettings>(key: K): DaveXSettings[K] | undefined {
  const val = getConfig(key as string);
  if (val === null) return undefined;
  try {
    return JSON.parse(val) as DaveXSettings[K];
  } catch {
    return val as unknown as DaveXSettings[K];
  }
}

export function setSetting<K extends keyof DaveXSettings>(key: K, value: DaveXSettings[K]): void {
  setConfig(key as string, JSON.stringify(value));
}

export function isFirstRun(): boolean {
  const val = getSetting('firstRun');
  return val === undefined || val === true;
}

export function markSetupDone(): void {
  setSetting('firstRun', false);
}

// Note: the canonical way to get the active provider (with full record) is
// getActiveProvider() in src/providers/registry.ts. This helper is kept only
// for quick provider/model id lookups from settings.
export function getActiveProviderIds(): { providerId: string; model: string } | null {
  const providerId = getSetting('activeProvider');
  const model = getSetting('activeModel');
  if (!providerId || !model) return null;
  return { providerId, model };
}
