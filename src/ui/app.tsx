import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { v4 as uuidv4 } from 'uuid';
import { runAgentLoop } from '../agent/loop.js';
import { getActiveProvider } from '../providers/registry.js';
import { getSetting } from '../config/settings.js';
import { sendToTelegram } from '../telegram/bot.js';
import { DAVEX_VERSION, DAVEX_AUTHOR, DAVEX_COMPANY, DAVEX_ASCII_LOGO } from '../config/constants.js';
import type { AgentContext, Todo } from '../agent/types.js';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  streaming?: boolean;
}

interface AppState {
  messages: Message[];
  input: string;
  isRunning: boolean;
  streamBuffer: string;
  todos: Todo[];
  currentTask?: string;
  questionPrompt?: string;
  awaitingQuestion: boolean;
  sessionId: string;
}

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({
    messages: [],
    input: '',
    isRunning: false,
    streamBuffer: '',
    todos: [],
    awaitingQuestion: false,
    sessionId: uuidv4(),
  });

  const abortRef = React.useRef<AbortController | null>(null);
  const questionResolveRef = React.useRef<((answer: string) => void) | null>(null);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (abortRef.current) {
        abortRef.current.abort();
      } else {
        exit();
      }
    }
  });

  const addMessage = useCallback((msg: Omit<Message, 'id'>) => {
    setState(s => ({
      ...s,
      messages: [...s.messages, { ...msg, id: uuidv4() }],
    }));
  }, []);

  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim() || state.isRunning) return;
    setState(s => ({ ...s, input: '', streamBuffer: '' }));

    // Handle question answer
    if (state.awaitingQuestion && questionResolveRef.current) {
      const resolve = questionResolveRef.current;
      questionResolveRef.current = null;
      setState(s => ({ ...s, awaitingQuestion: false, questionPrompt: undefined, isRunning: true }));
      addMessage({ role: 'user', content: value });
      resolve(value);
      return;
    }

    // Handle slash commands
    if (value.startsWith('/')) {
      await handleSlashCommand(value, addMessage, exit);
      return;
    }

    // Regular agent task
    addMessage({ role: 'user', content: value });
    setState(s => ({ ...s, isRunning: true, currentTask: value }));

    const provider = getActiveProvider();
    if (!provider) {
      addMessage({ role: 'error', content: '❌ No provider set. Run /providers to configure one.' });
      setState(s => ({ ...s, isRunning: false }));
      return;
    }

    const ctx: AgentContext = {
      sessionId: state.sessionId,
      workspacePath: getSetting('workspacePath') || process.cwd(),
      platform: 'terminal',
      yoloMode: getSetting('yoloMode') ?? false,
      fastMode: getSetting('fastMode') ?? false,
      verboseMode: getSetting('verboseMode') ?? false,
      reasoningMode: getSetting('reasoningMode') ?? false,
      planMode: getSetting('planMode') ?? false,
      personality: getSetting('personality'),
    };

    abortRef.current = new AbortController();

    let streamingMsgId: string | null = null;

    try {
      const result = await runAgentLoop({
        id: uuidv4(),
        userMessage: value,
        context: ctx,
        abortSignal: abortRef.current.signal,
        onProgress: (chunk) => {
          setState(s => {
            const newBuffer = s.streamBuffer + chunk;
            if (!streamingMsgId) {
              streamingMsgId = uuidv4();
            }
            return {
              ...s,
              streamBuffer: newBuffer,
              messages: streamingMsgId
                ? s.messages.map(m => m.id === streamingMsgId
                    ? { ...m, content: newBuffer }
                    : m)
                : [...s.messages, { id: streamingMsgId!, role: 'assistant', content: newBuffer, streaming: true }],
            };
          });
        },
        onQuestion: async (question) => {
          setState(s => ({
            ...s,
            awaitingQuestion: true,
            questionPrompt: question,
            isRunning: false,
          }));
          // Also ask on Telegram
          await sendToTelegram(`❓ Question:\n${question}\n\nReply here or in terminal.`);
          return new Promise<string>((resolve) => {
            questionResolveRef.current = resolve;
          });
        },
      });

      // Finalize streaming message
      setState(s => ({
        ...s,
        messages: s.messages.map(m =>
          m.id === streamingMsgId ? { ...m, streaming: false } : m
        ),
        isRunning: false,
        streamBuffer: '',
        todos: result.todos,
      }));

      // Send result to Telegram
      await sendToTelegram(`✅ Task done!\n\n${result.output.slice(0, 2000)}`);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addMessage({ role: 'error', content: `❌ ${err.message}` });
      }
      setState(s => ({ ...s, isRunning: false, streamBuffer: '' }));
    } finally {
      abortRef.current = null;
    }
  }, [state.isRunning, state.awaitingQuestion, state.sessionId, addMessage, exit]);

  const provider = getActiveProvider();
  const providerLabel = provider ? `${provider.name} / ${provider.model}` : 'no provider';

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>🦞 DaveX</Text>
        <Text color="gray"> v{DAVEX_VERSION}  •  </Text>
        <Text color="yellow">{providerLabel}</Text>
        <Text color="gray">  •  by {DAVEX_AUTHOR} @ {DAVEX_COMPANY}</Text>
        <Text color="gray">  •  Ctrl+C to exit</Text>
      </Box>

      {/* Messages area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1} overflowY="hidden">
        {state.messages.length === 0 && (
          <Box flexDirection="column">
            <Text color="cyan" dimColor>{DAVEX_ASCII_LOGO}</Text>
            <Text color="gray">  Type a task to get started. Use /help for commands.</Text>
            <Text color="gray">  Try: "create a snake game and deploy to localhost"</Text>
            <Text> </Text>
          </Box>
        )}
        {state.messages.slice(-20).map(msg => (
          <MessageBlock key={msg.id} message={msg} />
        ))}
        {state.isRunning && !state.streamBuffer && (
          <Box>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text color="gray"> Thinking...</Text>
          </Box>
        )}
      </Box>

      {/* Todos */}
      {state.todos.length > 0 && (
        <TodoPanel todos={state.todos} />
      )}

      {/* Question prompt */}
      {state.awaitingQuestion && state.questionPrompt && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow">❓ {state.questionPrompt}</Text>
        </Box>
      )}

      {/* Input */}
      <Box borderStyle="round" borderColor={state.isRunning ? 'gray' : 'cyan'} paddingX={1}>
        <Text color={state.isRunning ? 'gray' : 'cyan'}>
          {state.awaitingQuestion ? '💬 ' : state.isRunning ? '⏳ ' : '> '}
        </Text>
        <TextInput
          value={state.input}
          onChange={(val) => setState(s => ({ ...s, input: val }))}
          onSubmit={handleSubmit}
          placeholder={state.isRunning ? 'running...' : state.awaitingQuestion ? 'Type your answer...' : 'Type a task or /command...'}
        />
      </Box>
    </Box>
  );
}

function MessageBlock({ message }: { message: Message }): React.ReactElement {
  const colorMap = {
    user: 'green',
    assistant: 'white',
    system: 'blue',
    error: 'red',
  };
  const prefixMap = {
    user: '👤 You',
    assistant: '🦞 DaveX',
    system: '⚙️ System',
    error: '❌ Error',
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colorMap[message.role] as any} bold>
        {prefixMap[message.role]}
        {message.streaming ? ' ···' : ''}
      </Text>
      <Box paddingLeft={2}>
        <Text>{message.content}</Text>
      </Box>
    </Box>
  );
}

function TodoPanel({ todos }: { todos: Todo[] }): React.ReactElement {
  const statusIcon: Record<string, string> = {
    pending: '⬜',
    in_progress: '🔄',
    completed: '✅',
    cancelled: '❌',
    blocked: '🚫',
  };

  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1} flexDirection="column">
      <Text color="blue" bold>Tasks</Text>
      {todos.map(t => (
        <Text key={t.id} color={t.status === 'completed' ? 'gray' : 'white'}>
          {statusIcon[t.status]} {t.content}
        </Text>
      ))}
    </Box>
  );
}

async function handleSlashCommand(
  cmd: string,
  addMessage: (msg: Omit<Message, 'id'>) => void,
  exit: () => void
): Promise<void> {
  const parts = cmd.trim().split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case '/help':
      addMessage({ role: 'system', content: `DaveX Commands:
/providers    — set up a provider + API key + model
/changemodel  — switch your current model
/memory       — view or clear memory
/skills       — manage skills
/mcp          — manage MCP servers
/telegram     — telegram status
/extensions   — manage extensions
/theme        — change terminal theme
/plan         — toggle plan mode
/localmodel   — set up local model
/usage        — token usage
/hooks        — manage hooks
/help         — this message` });
      break;
    case '/providers':
      addMessage({ role: 'system', content: 'Opening provider setup... (run "davex --providers" for the interactive wizard)' });
      break;
    case '/memory':
      const { listMemory } = await import('../memory/manager.js');
      const mems = listMemory('global');
      if (mems.length === 0) {
        addMessage({ role: 'system', content: '🧠 No memories stored yet.' });
      } else {
        addMessage({ role: 'system', content: `🧠 Memory:\n${mems.slice(0, 20).map(m => `• ${m.key}: ${m.value}`).join('\n')}` });
      }
      break;
    case '/usage':
      const { getDb } = await import('../storage/db.js');
      const db = getDb();
      const row = db.prepare('SELECT SUM(prompt_tokens) as p, SUM(completion_tokens) as c, SUM(total_tokens) as t FROM usage').get() as any;
      addMessage({ role: 'system', content: `📊 Usage: ${row?.t ?? 0} total tokens (${row?.p ?? 0} prompt, ${row?.c ?? 0} completion)` });
      break;
    case '/clear':
      // Can't clear in Ink easily, but add a separator
      addMessage({ role: 'system', content: '─────────────────────────────' });
      break;
    case '/changemodel': {
      addMessage({ role: 'system', content: 'Run "davex --changemodel" from a new terminal to switch models interactively.' });
      break;
    }
    case '/mcp': {
      const { listMcpServers, addMcpServer, removeMcpServer } = await import('../mcp/manager.js');
      if (args.startsWith('add ')) {
        const [name, url] = args.replace('add ', '').split(' ');
        addMcpServer(name, { url });
        addMessage({ role: 'system', content: `✅ MCP server "${name}" added.` });
      } else if (args.startsWith('remove ')) {
        removeMcpServer(args.replace('remove ', ''));
        addMessage({ role: 'system', content: `🗑️ MCP server removed.` });
      } else {
        const servers = listMcpServers();
        addMessage({ role: 'system', content: servers.length === 0
          ? 'No MCP servers configured.\nUsage: /mcp add <name> <url>'
          : `MCP servers:\n${servers.map(s => `• ${s.name} ${s.enabled ? '✅' : '❌'} — ${s.url ?? s.command}`).join('\n')}` });
      }
      break;
    }
    case '/skills': {
      const { listSkills } = await import('../skills/manager.js');
      const skills = listSkills();
      addMessage({ role: 'system', content: skills.length === 0
        ? '🛠️ No skills installed yet. Drop SKILL.md folders into ~/.davex/skills'
        : `🛠️ Skills:\n${skills.map(s => `• ${s.name} ${s.enabled ? '✅' : '❌'} — ${s.description}`).join('\n')}` });
      break;
    }
    case '/extensions': {
      const { listExtensions } = await import('../extensions/manager.js');
      const exts = listExtensions();
      addMessage({ role: 'system', content: exts.length === 0
        ? '🧩 No extensions installed. Drop them in ~/.davex/extensions'
        : `🧩 Extensions:\n${exts.map(e => `• ${e.name} v${e.version} ${e.enabled ? '✅' : '❌'}`).join('\n')}` });
      break;
    }
    case '/theme': {
      const { listThemes, setTheme, getActiveTheme } = await import('./theme.js');
      if (args) {
        const ok = setTheme(args.trim());
        addMessage({ role: 'system', content: ok ? `🎨 Theme set to ${args}` : `Unknown theme. Options: ${listThemes().join(', ')}` });
      } else {
        addMessage({ role: 'system', content: `Current theme: ${getActiveTheme().name}\nOptions: ${listThemes().join(', ')}\nUsage: /theme <name>` });
      }
      break;
    }
    case '/plan': {
      const { getSetting, setSetting } = await import('../config/settings.js');
      const current = getSetting('planMode') ?? false;
      setSetting('planMode', !current);
      addMessage({ role: 'system', content: `📝 Plan mode: ${!current ? 'ON — DaveX will show a plan before acting' : 'OFF'}` });
      break;
    }
    case '/localmodel': {
      const { checkLocalModelStatus, startLocalModelServer, stopLocalModelServer } = await import('../providers/local-model.js');
      if (args === 'start') {
        addMessage({ role: 'system', content: await startLocalModelServer() });
      } else if (args === 'stop') {
        addMessage({ role: 'system', content: await stopLocalModelServer() });
      } else {
        const status = await checkLocalModelStatus();
        addMessage({ role: 'system', content: status.running
          ? `✅ Local model server running.\nModels: ${status.models.join(', ') || 'none'}`
          : '❌ Local model server not running.\nUse "/localmodel start" to start it.' });
      }
      break;
    }
    case '/hooks': {
      const { listHooks } = await import('../hooks/manager.js');
      const hooks = listHooks();
      addMessage({ role: 'system', content: hooks.length === 0
        ? '🪝 No hooks configured.'
        : `🪝 Hooks:\n${hooks.map(h => `• [${h.event}] ${h.command}`).join('\n')}` });
      break;
    }
    case '/telegram': {
      const { getSetting } = await import('../config/settings.js');
      const token = getSetting('telegramBotToken');
      const chatId = getSetting('telegramChatId');
      addMessage({ role: 'system', content: token && chatId
        ? `🤖 Telegram: ✅ connected (chat ${chatId})`
        : '🤖 Telegram: ❌ not connected. Run the setup wizard again to connect.' });
      break;
    }
    case '/exit':
    case '/quit':
      exit();
      break;
    default:
      addMessage({ role: 'system', content: `Unknown command: ${command}. Try /help` });
  }
}
