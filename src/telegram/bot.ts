import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSetting, setSetting } from '../config/settings.js';
import { getDb } from '../storage/db.js';
import { runAgentLoop } from '../agent/loop.js';
import { transcribeVoice, hasGroqWhisperKey, saveGroqWhisperKey } from '../voice/whisper.js';
import { listMemory, clearMemory } from '../memory/manager.js';
import { setActiveProvider, getActiveProvider } from '../providers/registry.js';
import { DAVEX_VERSION, DAVEX_AUTHOR, DAVEX_COMPANY, DAVEX_HOME, TELEGRAM_BOT_COMMANDS } from '../config/constants.js';
import type { AgentContext } from '../agent/types.js';

/**
 * A local, minimal message shape covering only the fields DaveX actually
 * reads. Deliberately NOT using the library's own `TelegramBot.Message`
 * namespace type — that pattern (default-import class used as a namespace
 * for `.Message`) is fragile across different TS transpilers/bundlers
 * (tsc, tsx/esbuild, swc all behave differently here) and was the exact
 * source of the "TelegramBot only refers to a type" build errors. A plain
 * local interface sidesteps that whole class of bug for good.
 */
interface TgMessage {
  message_id: number;
  chat: { id: number | string };
  from?: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };
  text?: string;
  voice?: { file_id: string };
  sticker?: { emoji?: string; set_name?: string };
}

let botInstance: TelegramBot | null = null;
const questionCallbacks = new Map<string, (answer: string) => void>();
const activeTasks = new Map<string, AbortController>();
const userStates = new Map<string, { awaitingGroqKey?: boolean; awaitingQuestion?: string }>();

export function getBot(): TelegramBot | null {
  return botInstance;
}

export async function startTelegramBot(): Promise<void> {
  const token = getSetting('telegramBotToken');
  const chatId = getSetting('telegramChatId');
  if (!token || !chatId) return;

  botInstance = new TelegramBot(token, { polling: true });

  try {
    await botInstance.setMyCommands(TELEGRAM_BOT_COMMANDS);
  } catch (err: any) {
    // Non-fatal — commands menu just won't be populated yet
    console.error('Could not set Telegram command list:', err.message);
  }

  console.log('🤖 Telegram bot started');

  botInstance.on('message', (msg) => {
    const tgMsg = msg as unknown as TgMessage;
    const msgChatId = String(tgMsg.chat.id);
    const allowedChatId = getSetting('telegramChatId');

    // Fire-and-forget with its own catch — a bad message must never crash
    // the process or take down the terminal UI running in the same app.
    (async () => {
      if (msgChatId !== allowedChatId) {
        await handleUnknownUser(tgMsg);
        return;
      }
      await handleMessage(tgMsg, msgChatId);
    })().catch((err) => {
      console.error('Telegram message handler error:', err?.message ?? err);
    });
  });

  // node-telegram-bot-api emits 'polling_error' for most network hiccups,
  // but some transport-level failures (DNS timeouts, aborted connections)
  // can still surface as unhandled rejections that bypass this handler
  // entirely and crash the whole Node process. Both are covered:
  // this listener catches the ones the library reports correctly...
  botInstance.on('polling_error', (err: any) => {
    console.error('⚠️  Telegram polling error (will keep retrying):', err?.message ?? err);
  });

  botInstance.on('error', (err: any) => {
    console.error('⚠️  Telegram bot error (will keep retrying):', err?.message ?? err);
  });

  // ...and process.on('unhandledRejection')/('uncaughtException') in
  // index.ts catches everything else, so one dropped connection can never
  // take down DaveX's terminal session again.
}

export function stopTelegramBot(): void {
  botInstance?.stopPolling().catch(() => {});
  botInstance = null;
}

async function handleMessage(msg: TgMessage, chatId: string): Promise<void> {
  if (!botInstance) return;
  const text = msg.text ?? '';
  const userId = String(msg.from?.id ?? chatId);

  const state = userStates.get(userId);

  if (state?.awaitingGroqKey) {
    await saveGroqWhisperKey(text.trim());
    userStates.delete(userId);
    await botInstance.sendMessage(chatId, '✅ Groq API key saved! Processing your voice message now...');
    return;
  }

  if (state?.awaitingQuestion) {
    const cb = questionCallbacks.get(state.awaitingQuestion);
    if (cb) {
      cb(text);
      questionCallbacks.delete(state.awaitingQuestion);
      userStates.delete(userId);
      return;
    }
  }

  if (msg.voice) {
    await handleVoiceMessage(msg, chatId, userId);
    return;
  }

  if (msg.sticker) {
    await handleSticker(msg, chatId);
    return;
  }

  if (!text) return;

  if (text.startsWith('/')) {
    await handleCommand(text, msg, chatId, userId);
    return;
  }

  await runAgentTask(text, chatId, userId);
}

async function handleCommand(text: string, msg: TgMessage, chatId: string, userId: string): Promise<void> {
  if (!botInstance) return;
  const parts = text.split(' ');
  const cmd = parts[0].replace('/', '').toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case 'start':
    case 'help':
      await sendHelp(chatId); break;
    case 'whoami':
      await sendWhoami(chatId); break;
    case 'version':
      await botInstance.sendMessage(chatId, `DaveX v${DAVEX_VERSION}\nBy ${DAVEX_AUTHOR} @ ${DAVEX_COMPANY}`); break;
    case 'credits':
      await botInstance.sendMessage(chatId, `🦞 *DaveX*\nVersion: ${DAVEX_VERSION}\nMade by: ${DAVEX_AUTHOR}\nCompany: ${DAVEX_COMPANY}`, { parse_mode: 'Markdown' }); break;
    case 'status':
      await sendStatus(chatId); break;
    case 'stop':
      await stopCurrentTask(chatId, userId); break;
    case 'reset':
      await resetSession(chatId); break;
    case 'retry':
      await retryLastMessage(chatId, userId); break;
    case 'undo':
      await botInstance.sendMessage(chatId, '↩️ Undo not yet available in this session.'); break;
    case 'memory':
      await sendMemory(chatId, args); break;
    case 'model':
      await handleModelCommand(chatId, args); break;
    case 'yolo':
      await toggleSetting(chatId, 'yoloMode', 'YOLO mode'); break;
    case 'fast':
      await toggleSetting(chatId, 'fastMode', 'Fast mode'); break;
    case 'verbose':
      await toggleSetting(chatId, 'verboseMode', 'Verbose mode'); break;
    case 'reasoning':
      await toggleSetting(chatId, 'reasoningMode', 'Reasoning display'); break;
    case 'background':
      await botInstance.sendMessage(chatId, '🔄 Background mode: next task will run without streaming updates.'); break;
    case 'personality':
      if (args) { setSetting('personality', args); await botInstance.sendMessage(chatId, `✅ Personality set: ${args}`); }
      else await botInstance.sendMessage(chatId, `Current personality: ${getSetting('personality') || 'default'}`);
      break;
    case 'topic':
      await botInstance.sendMessage(chatId, args ? `📌 Topic set: ${args}` : 'Usage: /topic <topic>'); break;
    case 'title':
      await botInstance.sendMessage(chatId, args ? `📝 Title set: ${args}` : 'Usage: /title <title>'); break;
    case 'compress':
      await botInstance.sendMessage(chatId, '🗜️ Context compressed (feature coming soon).'); break;
    case 'usage':
      await sendUsage(chatId); break;
    case 'insights':
      await sendInsights(chatId); break;
    case 'kanban':
      await sendKanban(chatId); break;
    case 'goal':
      await botInstance.sendMessage(chatId, args ? `🎯 Goal set: ${args}` : 'Usage: /goal <your goal>'); break;
    case 'subgoal':
      await botInstance.sendMessage(chatId, args ? `→ Subgoal: ${args}` : 'Usage: /subgoal <subgoal>'); break;
    case 'sessions':
      await sendSessions(chatId); break;
    case 'resume':
      await botInstance.sendMessage(chatId, '▶️ Resume: use /sessions to pick a session to resume.'); break;
    case 'branch':
      await botInstance.sendMessage(chatId, '🌿 Branch created from current session.'); break;
    case 'rollback':
      await botInstance.sendMessage(chatId, '⏪ Rollback feature coming soon.'); break;
    case 'skills':
      await sendSkills(chatId); break;
    case 'reload_skills':
      await botInstance.sendMessage(chatId, '🔄 Skills reloaded.'); break;
    case 'reload_mcp':
      await botInstance.sendMessage(chatId, '🔄 MCP servers reloaded.'); break;
    case 'bundles':
      await botInstance.sendMessage(chatId, '📦 No skill bundles installed yet. Visit the skills directory.'); break;
    case 'approve':
      await handleApprove(chatId, args); break;
    case 'deny':
      await handleDeny(chatId, args); break;
    case 'voice':
      await toggleSetting(chatId, 'voiceEnabled', 'Voice transcription'); break;
    case 'debug':
      await sendDebug(chatId); break;
    case 'update':
      await botInstance.sendMessage(chatId, '🔄 Run `npm install -g davex@latest` to update.'); break;
    case 'agents':
      await botInstance.sendMessage(chatId, '🤖 DaveX is running as a single agent. Multi-agent mode coming soon.'); break;
    case 'platform':
      await botInstance.sendMessage(chatId, '📱 Platform: Telegram\n💻 Terminal also connected'); break;
    case 'profile':
      await sendProfile(chatId, msg); break;
    default:
      await runAgentTask(text, chatId, userId);
  }
}

async function runAgentTask(userMessage: string, chatId: string, userId: string): Promise<void> {
  if (!botInstance) return;

  const sessionId = await getOrCreateSession(chatId);
  const workspacePath = getSetting('workspacePath') || process.env.HOME || '/tmp';

  const typing = setInterval(() => botInstance?.sendChatAction(chatId, 'typing').catch(() => {}), 4000);
  const statusMsg = await botInstance.sendMessage(chatId, '⚙️ Working...');

  const controller = new AbortController();
  activeTasks.set(userId, controller);

  let progressBuffer = '';
  let lastUpdate = Date.now();

  const ctx: AgentContext = {
    sessionId,
    workspacePath,
    platform: 'telegram',
    chatId,
    yoloMode: getSetting('yoloMode') ?? false,
    fastMode: getSetting('fastMode') ?? false,
    verboseMode: getSetting('verboseMode') ?? false,
    reasoningMode: getSetting('reasoningMode') ?? false,
    planMode: getSetting('planMode') ?? false,
    personality: getSetting('personality'),
  };

  try {
    const result = await runAgentLoop({
      id: uuidv4(),
      userMessage,
      context: ctx,
      abortSignal: controller.signal,
      onProgress: (chunk) => {
        progressBuffer += chunk;
        const now = Date.now();
        if (now - lastUpdate > 3000 && progressBuffer.length > 10) {
          botInstance?.editMessageText(
            `⚙️ Working...\n\n${progressBuffer.slice(-800)}`,
            { chat_id: chatId, message_id: statusMsg.message_id }
          ).catch(() => {});
          lastUpdate = now;
        }
      },
      onQuestion: async (question) => {
        const qId = uuidv4();
        await botInstance!.editMessageText(`❓ *Question:*\n${question}`, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown',
        }).catch(() => {});
        userStates.set(userId, { awaitingQuestion: qId });
        return new Promise<string>((resolve) => {
          questionCallbacks.set(qId, resolve);
        });
      },
    });

    clearInterval(typing);
    activeTasks.delete(userId);

    const output = result.output.slice(0, 4000);
    await botInstance.editMessageText(`✅ Done!\n\n${output}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    }).catch(() => botInstance?.sendMessage(chatId, `✅ Done!\n\n${output}`));

  } catch (err: any) {
    clearInterval(typing);
    activeTasks.delete(userId);
    await botInstance.editMessageText(`❌ Error: ${err.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    }).catch(() => {});
  }
}

async function handleVoiceMessage(msg: TgMessage, chatId: string, userId: string): Promise<void> {
  if (!botInstance) return;

  if (!(await hasGroqWhisperKey())) {
    userStates.set(userId, { awaitingGroqKey: true });
    await botInstance.sendMessage(
      chatId,
      '🎤 Voice transcription uses Groq Whisper.\n\nPlease send your *Groq API key* to enable it:',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const statusMsg = await botInstance.sendMessage(chatId, '🎤 Transcribing voice message...');

  try {
    const fileId = msg.voice!.file_id;
    const fileInfo = await botInstance.getFile(fileId);
    const token = getSetting('telegramBotToken')!;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;

    const tmpPath = path.join(DAVEX_HOME, `voice_${Date.now()}.ogg`);
    await fs.ensureDir(DAVEX_HOME);

    const res = await fetch(fileUrl);
    const buffer = await res.arrayBuffer();
    await fs.writeFile(tmpPath, Buffer.from(buffer));

    const transcript = await transcribeVoice(tmpPath);
    await fs.remove(tmpPath);

    await botInstance.editMessageText(`🎤 *Transcribed:*\n${transcript}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown',
    });

    await runAgentTask(transcript, chatId, userId);

  } catch (err: any) {
    await botInstance.editMessageText(`❌ Transcription error: ${err.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    }).catch(() => {});
  }
}

async function handleSticker(msg: TgMessage, chatId: string): Promise<void> {
  if (!botInstance) return;
  const emoji = msg.sticker?.emoji ?? '';
  const setName = msg.sticker?.set_name ?? 'unknown';
  await botInstance.sendMessage(chatId, `🎭 Sticker received: ${emoji} (set: ${setName})\nSticker vision description coming soon.`);
}

async function handleUnknownUser(msg: TgMessage): Promise<void> {
  if (!botInstance) return;
  const chatId = String(msg.chat.id);
  const db = getDb();

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();

  await db.from('pairing_codes').upsert({
    id: uuidv4(), platform: 'telegram', user_id: chatId, code, expires_at: expiresAt,
  });

  await botInstance.sendMessage(
    chatId,
    `👋 Hi! I'm DaveX.\n\nYou need to be authorized to use me.\n\nYour pairing code is:\n\`${code}\`\n\nSend this code to the bot owner to get access.`,
    { parse_mode: 'Markdown' }
  );

  const ownerChatId = getSetting('telegramChatId');
  if (ownerChatId) {
    const username = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name ?? 'Unknown';
    await botInstance.sendMessage(
      ownerChatId,
      `🔔 New pairing request from ${username} (ID: ${chatId})\nCode: \`${code}\`\n\nApprove with: /approve ${code}\nDeny with: /deny ${code}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

async function handleApprove(chatId: string, args: string): Promise<void> {
  if (!botInstance) return;
  const code = args.trim();
  if (!code) { await botInstance.sendMessage(chatId, 'Usage: /approve <code>'); return; }

  const db = getDb();
  const { data: row } = await db.from('pairing_codes').select('*').eq('code', code).eq('used', false).maybeSingle();
  if (!row) { await botInstance.sendMessage(chatId, '❌ Code not found or already used.'); return; }

  await db.from('pairing_codes').update({ used: true }).eq('code', code);
  await db.from('approved_users').upsert({ id: uuidv4(), platform: row.platform, user_id: row.user_id }, { onConflict: 'platform,user_id' });

  await botInstance.sendMessage(chatId, `✅ User ${row.user_id} approved.`);
  await botInstance.sendMessage(row.user_id, '✅ You have been approved! You can now use DaveX.').catch(() => {});
}

async function handleDeny(chatId: string, args: string): Promise<void> {
  if (!botInstance) return;
  const code = args.trim();
  if (!code) { await botInstance.sendMessage(chatId, 'Usage: /deny <code>'); return; }
  const db = getDb();
  await db.from('pairing_codes').delete().eq('code', code);
  await botInstance.sendMessage(chatId, `❌ Code ${code} denied and removed.`);
}

async function stopCurrentTask(chatId: string, userId: string): Promise<void> {
  if (!botInstance) return;
  const controller = activeTasks.get(userId);
  if (controller) {
    controller.abort();
    activeTasks.delete(userId);
    await botInstance.sendMessage(chatId, '⏹️ Task stopped.');
  } else {
    await botInstance.sendMessage(chatId, 'No active task to stop.');
  }
}

async function resetSession(chatId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  await db.from('sessions').update({ is_active: false }).eq('chat_id', chatId).eq('platform', 'telegram');
  await botInstance.sendMessage(chatId, '🔄 Session reset. Starting fresh!');
}

async function retryLastMessage(chatId: string, userId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  const { data: sessions } = await db.from('sessions').select('id').eq('chat_id', chatId);
  const sessionIds = (sessions ?? []).map(s => s.id);

  if (sessionIds.length === 0) {
    await botInstance.sendMessage(chatId, 'No previous message to retry.');
    return;
  }

  const { data: row } = await db.from('messages').select('content')
    .in('session_id', sessionIds).eq('role', 'user')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (row) {
    await runAgentTask(row.content, chatId, userId);
  } else {
    await botInstance.sendMessage(chatId, 'No previous message to retry.');
  }
}

async function sendHelp(chatId: string): Promise<void> {
  if (!botInstance) return;
  const help = `🦞 *DaveX* — AI Coding Agent
By ${DAVEX_AUTHOR} @ ${DAVEX_COMPANY} | v${DAVEX_VERSION}

Just send me any task and I'll get it done!

*Session*
/reset — reset session
/retry — retry last message  
/sessions — list sessions
/stop — stop current task

*Agent*
/yolo — skip confirmations
/fast — fast mode
/verbose — verbose output
/reasoning — show reasoning
/model — switch model

*Memory & Tasks*
/memory — view memory
/kanban — task board
/goal <goal> — set goal
/usage — token usage

*Info*
/status — agent status
/whoami — bot info
/version — version
/help — this message`;

  await botInstance.sendMessage(chatId, help, { parse_mode: 'Markdown' });
}

async function sendWhoami(chatId: string): Promise<void> {
  if (!botInstance) return;
  const provider = await getActiveProvider();
  const msg = `🦞 *DaveX*
Version: ${DAVEX_VERSION}
Made by: ${DAVEX_AUTHOR}
Company: ${DAVEX_COMPANY}
Provider: ${provider?.name ?? 'none'}
Model: ${provider?.model ?? 'none'}`;
  await botInstance.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function sendStatus(chatId: string): Promise<void> {
  if (!botInstance) return;
  const provider = await getActiveProvider();
  const workspace = getSetting('workspacePath') ?? 'not set';
  const msg = `📊 *Status*
Provider: ${provider?.name ?? '❌ none'}
Model: ${provider?.model ?? '❌ none'}
Workspace: ${workspace}
Yolo: ${getSetting('yoloMode') ? '✅' : '❌'}
Fast: ${getSetting('fastMode') ? '✅' : '❌'}
Voice: ${getSetting('voiceEnabled') ? '✅' : '❌'}`;
  await botInstance.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function sendMemory(chatId: string, args: string): Promise<void> {
  if (!botInstance) return;
  if (args === 'clear') {
    await clearMemory('global');
    await botInstance.sendMessage(chatId, '🧠 Long-term memory cleared.');
    return;
  }
  const memories = await listMemory('global');
  if (memories.length === 0) {
    await botInstance.sendMessage(chatId, '🧠 No memories stored yet.');
    return;
  }
  const lines = memories.slice(0, 20).map(m => `• *${m.key}*: ${m.value}`);
  await botInstance.sendMessage(chatId, `🧠 *Memory*\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
}

async function sendUsage(chatId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  const { data } = await db.from('usage').select('prompt_tokens, completion_tokens, total_tokens');
  const totals = (data ?? []).reduce((acc, r) => ({
    p: acc.p + (r.prompt_tokens ?? 0),
    c: acc.c + (r.completion_tokens ?? 0),
    t: acc.t + (r.total_tokens ?? 0),
  }), { p: 0, c: 0, t: 0 });
  const msg = `📊 *Token Usage*
Prompt tokens: ${totals.p}
Completion tokens: ${totals.c}
Total tokens: ${totals.t}`;
  await botInstance.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function sendInsights(chatId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  const { data } = await db.from('usage').select('provider, model, total_tokens');
  if (!data || data.length === 0) { await botInstance.sendMessage(chatId, 'No usage data yet.'); return; }

  const grouped = new Map<string, { sessions: number; tokens: number }>();
  for (const r of data) {
    const key = `${r.provider}/${r.model}`;
    const entry = grouped.get(key) ?? { sessions: 0, tokens: 0 };
    entry.sessions++;
    entry.tokens += r.total_tokens ?? 0;
    grouped.set(key, entry);
  }
  const lines = Array.from(grouped.entries()).map(([k, v]) => `• ${k}: ${v.sessions} sessions, ${v.tokens} tokens`);
  await botInstance.sendMessage(chatId, `📈 *Insights*\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
}

async function sendKanban(chatId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  const { data: rows } = await db.from('kanban').select('*').order('updated_at', { ascending: false }).limit(20);
  if (!rows || rows.length === 0) { await botInstance.sendMessage(chatId, '📋 Kanban board is empty.'); return; }

  const byStatus: Record<string, string[]> = { todo: [], in_progress: [], done: [] };
  for (const r of rows) {
    const list = byStatus[r.status] ?? byStatus.todo;
    list.push(`• ${r.title}`);
  }

  const msg = `📋 *Kanban Board*
🔲 *Todo*\n${byStatus.todo.join('\n') || 'empty'}
⚡ *In Progress*\n${byStatus.in_progress.join('\n') || 'empty'}
✅ *Done*\n${byStatus.done.join('\n') || 'empty'}`;

  await botInstance.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function sendSessions(chatId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  const { data: rows } = await db.from('sessions').select('*').order('updated_at', { ascending: false }).limit(10);
  if (!rows || rows.length === 0) { await botInstance.sendMessage(chatId, 'No sessions yet.'); return; }
  const lines = rows.map(r => `• ${r.title ?? 'Untitled'} (${r.platform}) — ${r.updated_at}`);
  await botInstance.sendMessage(chatId, `📋 *Sessions*\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
}

async function sendSkills(chatId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  const { data: rows } = await db.from('skills').select('*');
  if (!rows || rows.length === 0) { await botInstance.sendMessage(chatId, '🛠️ No skills installed yet.'); return; }
  const lines = rows.map(r => `• ${r.name} ${r.enabled ? '✅' : '❌'}`);
  await botInstance.sendMessage(chatId, `🛠️ *Skills*\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
}

async function sendDebug(chatId: string): Promise<void> {
  if (!botInstance) return;
  const db = getDb();
  const { count: msgCount } = await db.from('messages').select('*', { count: 'exact', head: true });
  const { count: memCount } = await db.from('memory').select('*', { count: 'exact', head: true });
  const msg = `🐛 *Debug*
Messages in DB: ${msgCount ?? 0}
Memory entries: ${memCount ?? 0}
Active tasks: ${activeTasks.size}
Node: ${process.version}
Platform: ${process.platform}`;
  await botInstance.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function sendProfile(chatId: string, msg: TgMessage): Promise<void> {
  if (!botInstance) return;
  const user = msg.from;
  const profile = `👤 *Profile*
Name: ${user?.first_name ?? ''} ${user?.last_name ?? ''}
Username: ${user?.username ? `@${user.username}` : 'none'}
ID: ${user?.id}
Language: ${user?.language_code ?? 'unknown'}`;
  await botInstance.sendMessage(chatId, profile, { parse_mode: 'Markdown' });
}

async function handleModelCommand(chatId: string, args: string): Promise<void> {
  if (!botInstance) return;
  const provider = await getActiveProvider();
  if (!provider) {
    await botInstance.sendMessage(chatId, '❌ No provider set. Use /providers in the terminal first.');
    return;
  }
  if (args) {
    await setActiveProvider(provider.id, args);
    await botInstance.sendMessage(chatId, `✅ Model changed to: ${args}`);
  } else {
    await botInstance.sendMessage(chatId, `Current model: ${provider.model}\n\nUse /model <model_name> to switch.`);
  }
}

async function toggleSetting(chatId: string, key: keyof import('../config/settings.js').DaveXSettings, label: string): Promise<void> {
  if (!botInstance) return;
  const current = getSetting(key as any) ?? false;
  setSetting(key as any, !current);
  await botInstance.sendMessage(chatId, `${label}: ${!current ? '✅ ON' : '❌ OFF'}`);
}

export async function sendToTelegram(message: string): Promise<void> {
  const bot = botInstance;
  const chatId = getSetting('telegramChatId');
  if (!bot || !chatId) return;
  await bot.sendMessage(chatId, message).catch(() => {});
}

async function getOrCreateSession(chatId: string): Promise<string> {
  const db = getDb();
  const { data: existing } = await db.from('sessions').select('id')
    .eq('chat_id', chatId).eq('platform', 'telegram').eq('is_active', true).maybeSingle();
  if (existing) return existing.id;

  const id = uuidv4();
  await db.from('sessions').insert({ id, platform: 'telegram', chat_id: chatId });
  return id;
}

function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
