import React, { useState, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { setSetting, markSetupDone } from '../config/settings.js';
import { fetchModels, saveProvider, setActiveProvider } from '../providers/registry.js';
import { PROVIDERS, DAVEX_ASCII_LOGO, DAVEX_VERSION, DAVEX_AUTHOR, DAVEX_COMPANY } from '../config/constants.js';
import fs from 'fs-extra';

type WizardStep =
  | 'logo'
  | 'workspace'
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
  onDone: () => void;
}

export function Wizard({ onDone }: WizardProps): React.ReactElement {
  const [state, setState] = useState<WizardState>({
    step: 'logo',
    input: '',
    workspacePath: process.cwd(),
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
              set({ workspacePath: workspace, step: 'telegram_token', input: '', error: '' });
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
        <SelectInput
          items={items}
          onSelect={(item) => {
            saveProvider(state.selectedProvider, state.apiKey, item.value);
            setActiveProvider(state.selectedProvider, item.value);
            set({ selectedModel: item.value, step: 'done' });
          }}
        />
      </Box>
    );
  }

  // Done
  if (state.step === 'done') {
    markSetupDone();
    setSetting('firstRun', false);
    setTimeout(onDone, 1500);
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
