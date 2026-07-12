import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { setSetting, markSetupDone } from '../config/settings.js';
import { fetchModels, saveProvider, setActiveProvider } from '../providers/registry.js';
import { PROVIDERS, DAVEX_ASCII_LOGO, DAVEX_VERSION, DAVEX_AUTHOR, DAVEX_COMPANY } from '../config/constants.js';
import fs from 'fs-extra';

type WizardStep =
  | 'logo'
  | 'workspace'
  | 'supabase_url'
  | 'supabase_key'
  | 'telegram_token'
  | 'telegram_chat_id'
  | 'provider_select'
  | 'provider_key'
  | 'model_select'
  | 'done';

interface WizardState {
  step: WizardStep;
  input: string;
  workspacePath: string;
  supabaseUrl: string;
  telegramToken: string;
  telegramChatId: string;
  selectedProvider: string;
  apiKey: string;
  models: string[];
  selectedModel: string;
  loading: boolean;
  error: string;
}

interface WizardProps {
  onDone: () => void | Promise<void>;
}

export function Wizard({ onDone }: WizardProps): React.ReactElement {
  const [state, setState] = useState<WizardState>({
    step: 'logo',
    input: '',
    workspacePath: process.cwd(),
    supabaseUrl: '',
    telegramToken: '',
    telegramChatId: '',
    selectedProvider: '',
    apiKey: '',
    models: [],
    selectedModel: '',
    loading: false,
    error: '',
  });

  const set = useCallback((patch: Partial<WizardState>) => {
    setState(s => ({ ...s, ...patch }));
  }, []);

  // Logo screen — press Enter to continue
  if (state.step === 'logo') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>{DAVEX_ASCII_LOGO}</Text>
        <Text color="cyan" bold>  AI Coding Agent v{DAVEX_VERSION}</Text>
        <Text color="blue">  By {DAVEX_AUTHOR} @ {DAVEX_COMPANY}</Text>
        <Text> </Text>
        <Text color="gray">  Press Enter to start setup...</Text>
        <TextInput value="" onChange={() => {}} onSubmit={() => set({ step: 'workspace' })} />
      </Box>
    );
  }

  // Workspace approval
  if (state.step === 'workspace') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>📁 Workspace</Text>
        <Text> </Text>
        <Text>DaveX wants to use this folder as your workspace:</Text>
        <Text color="yellow" bold>  {state.workspacePath}</Text>
        <Text> </Text>
        <Text color="gray">Type a different path, or press Enter to approve.</Text>
        <Box>
          <Text color="cyan">&gt; </Text>
          <TextInput
            value={state.input}
            onChange={(v) => set({ input: v })}
            onSubmit={async (v) => {
              const workspace = v.trim() || state.workspacePath;
              if (!await fs.pathExists(workspace)) {
                set({ error: `Path does not exist: ${workspace}` });
                return;
              }
              setSetting('workspacePath', workspace);
              setSetting('workspaceApproved', true);
              set({ workspacePath: workspace, step: 'supabase_url', input: '', error: '' });
            }}
          />
        </Box>
        {state.error && <Text color="red">{state.error}</Text>}
      </Box>
    );
  }

  // Supabase project URL — DaveX stores everything (sessions, memory,
  // providers, Telegram pairing) here instead of a local SQLite file, so
  // it works identically on desktop, servers, and phones (Termux/Android
  // can't compile the native SQLite module).
  if (state.step === 'supabase_url') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🗄️  Storage — Supabase Project URL</Text>
        <Text> </Text>
        <Text>DaveX stores sessions, memory, and settings in a Supabase project.</Text>
        <Text color="gray">Create one free at supabase.com, then paste its Project URL below.</Text>
        <Text color="gray">Example: https://abcdefgh.supabase.co</Text>
        <Text> </Text>
        <Box>
          <Text color="cyan">&gt; Project URL: </Text>
          <TextInput
            value={state.input}
            onChange={(v) => set({ input: v })}
            onSubmit={(v) => {
              const url = v.trim();
              if (!url) { set({ error: 'A Supabase project URL is required.' }); return; }
              setSetting('supabaseUrl', url);
              set({ supabaseUrl: url, step: 'supabase_key', input: '', error: '' });
            }}
          />
        </Box>
        {state.error && <Text color="red">{state.error}</Text>}
      </Box>
    );
  }

  // Supabase service role key
  if (state.step === 'supabase_key') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🔑 Storage — Supabase Service Role Key</Text>
        <Text> </Text>
        <Text>Project Settings → API → service_role key (starts with "eyJ...")</Text>
        <Text color="gray">This stays local on this device — never sent anywhere else.</Text>
        <Text> </Text>
        <Box>
          <Text color="cyan">&gt; Service role key: </Text>
          <TextInput
            value={state.input}
            onChange={(v) => set({ input: v })}
            mask="*"
            onSubmit={(v) => {
              const key = v.trim();
              if (!key) { set({ error: 'The service role key is required.' }); return; }
              setSetting('supabaseServiceKey', key);
              set({ step: 'telegram_token', input: '', error: '' });
            }}
          />
        </Box>
        {state.error && <Text color="red">{state.error}</Text>}
      </Box>
    );
  }

  // Telegram bot token
  if (state.step === 'telegram_token') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🤖 Telegram Setup</Text>
        <Text> </Text>
        <Text>Enter your Telegram bot token.</Text>
        <Text color="gray">Get one from @BotFather on Telegram.</Text>
        <Text color="gray">Press Enter to skip.</Text>
        <Text> </Text>
        <Box>
          <Text color="cyan">&gt; Bot token: </Text>
          <TextInput
            value={state.input}
            onChange={(v) => set({ input: v })}
            onSubmit={(v) => {
              const token = v.trim();
              if (token) setSetting('telegramBotToken', token);
              set({ telegramToken: token, step: 'telegram_chat_id', input: '' });
            }}
          />
        </Box>
      </Box>
    );
  }

  // Telegram chat ID
  if (state.step === 'telegram_chat_id') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🤖 Telegram Chat ID</Text>
        <Text> </Text>
        <Text>Enter your Telegram chat ID.</Text>
        <Text color="gray">Send a message to @userinfobot to get your ID.</Text>
        <Text color="gray">Press Enter to skip.</Text>
        <Text> </Text>
        <Box>
          <Text color="cyan">&gt; Chat ID: </Text>
          <TextInput
            value={state.input}
            onChange={(v) => set({ input: v })}
            onSubmit={(v) => {
              const chatId = v.trim();
              if (chatId) {
                setSetting('telegramChatId', chatId);
                setSetting('telegramEnabled', true);
              }
              set({ telegramChatId: chatId, step: 'provider_select', input: '' });
            }}
          />
        </Box>
      </Box>
    );
  }

  // Provider selection
  if (state.step === 'provider_select') {
    const items = PROVIDERS.map(p => ({ label: p.name, value: p.id }));
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>⚡ Choose a Provider</Text>
        <Text> </Text>
        <Text color="gray">Select an AI provider:</Text>
        <Text> </Text>
        <SelectInput
          items={items}
          onSelect={(item) => {
            set({ selectedProvider: item.value, step: 'provider_key', input: '' });
          }}
        />
        <Text> </Text>
        <Text color="gray">(You can add more providers later with /providers)</Text>
      </Box>
    );
  }

  // API key entry
  if (state.step === 'provider_key') {
    const providerInfo = PROVIDERS.find(p => p.id === state.selectedProvider);
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🔑 API Key — {providerInfo?.name}</Text>
        <Text> </Text>
        <Box>
          <Text color="cyan">&gt; API key: </Text>
          <TextInput
            value={state.input}
            onChange={(v) => set({ input: v })}
            mask="*"
            onSubmit={async (v) => {
              const key = v.trim();
              if (!key) { set({ error: 'API key is required.' }); return; }
              set({ loading: true, error: '' });
              try {
                const models = await fetchModels(state.selectedProvider, key);
                set({ apiKey: key, models, step: 'model_select', input: '', loading: false });
              } catch (err: any) {
                set({ loading: false, error: `Could not fetch models: ${err.message}` });
              }
            }}
          />
        </Box>
        {state.loading && <Text color="cyan">Fetching models...</Text>}
        {state.error && <Text color="red">{state.error}</Text>}
      </Box>
    );
  }

  // Model selection
  if (state.step === 'model_select') {
    const items = state.models.map(m => ({ label: m, value: m }));
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>🤖 Choose a Model</Text>
        <Text> </Text>
        {state.loading && <Text color="cyan">Saving...</Text>}
        {state.error && <Text color="red">{state.error}</Text>}
        <SelectInput
          items={items}
          onSelect={(item) => {
            set({ loading: true, error: '' });
            (async () => {
              try {
                await saveProvider(state.selectedProvider, state.apiKey, item.value);
                await setActiveProvider(state.selectedProvider, item.value);
                set({ selectedModel: item.value, step: 'done', loading: false });
              } catch (err: any) {
                set({ loading: false, error: `Could not save provider: ${err.message}` });
              }
            })();
          }}
        />
      </Box>
    );
  }

  // Done
  if (state.step === 'done') {
    markSetupDone();
    setTimeout(() => { void onDone(); }, 1500);
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>✅ DaveX is ready!</Text>
        <Text> </Text>
        <Text>Provider: <Text color="cyan">{PROVIDERS.find(p => p.id === state.selectedProvider)?.name}</Text></Text>
        <Text>Model: <Text color="cyan">{state.selectedModel}</Text></Text>
        {state.telegramToken && <Text>Telegram: <Text color="green">✅ connected</Text></Text>}
        <Text> </Text>
        <Text color="gray">Starting DaveX...</Text>
      </Box>
    );
  }

  return <Text>Loading...</Text>;
}
