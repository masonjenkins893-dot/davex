# 🦞 DaveX

**AI Coding Agent** — runs in your terminal, connects to Telegram, codes anything, remembers everything.

Made by **Inyang David** @ **Sixpert**

---

## What is DaveX?

DaveX is a coding-first AI agent that works like Claude Code and Gemini CLI in your terminal, but also:

- Connects to **Telegram** so you can send it tasks and get results from your phone
- Runs **autonomously** — keeps working until the task is done, no need to babysit it
- Supports **25+ AI providers** — OpenAI, Anthropic, Gemini, Grok, Groq, Mistral, Cohere, Together, Cerebras, Nvidia NIM, Fireworks, Hyperbolic, DeepInfra, OpenRouter, HuggingFace, Perplexity, Qwen, SambaNova, Novita, AI21, MonsterAPI, Lepton, Cloudflare AI, Replicate, and local models
- **Remembers** — short-term session memory + long-term memory that survives restarts
- Can **run and deploy code** — tell it to build something and run it locally, it'll give you the URL
- **Asks questions** when it needs info — pauses and waits for your answer, in terminal or Telegram
- Connects to **MCP servers**
- Has a **skills system**, **extensions**, **hooks**, **themes**, and **plan mode**

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/sixpert/davex/main/install.sh | bash
```

Then run:

```bash
davex
```

---

## Database Setup

DaveX uses Supabase for storage. Before running the setup wizard, you **must** initialize your database tables:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your project and go to the **SQL Editor**.
3. Copy the contents of [`supabase_schema.sql`](./supabase_schema.sql) and run it.

## First run

1. DaveX shows its logo
2. Approves your workspace folder
3. Asks for your Telegram bot token (from @BotFather)
4. Asks for your Telegram chat ID
5. Lets you pick a provider, enter your API key, and choose a model
6. You're ready to go

---

## Usage

Just type a task:

```
> create a snake game and deploy it to localhost
```

DaveX will build it, run it, and give you the URL — in the terminal and on Telegram.

### Slash commands

```
/providers      pick provider + api key + model
/changemodel    switch model
/memory         view or clear memory
/skills         manage skills
/mcp            add or manage MCP servers
/telegram       telegram status
/extensions     manage extensions
/theme          change terminal theme
/plan           toggle plan mode
/localmodel     run a local model
/usage          token usage
/hooks          manage hooks
/help           all commands
```

### Telegram bot commands

Send `/help` to your bot for the full list. Includes session control, goals, kanban board, voice message transcription (via Groq Whisper), and more.

---

## Providers supported

OpenAI · Anthropic · Google Gemini · xAI/Grok · Groq · Mistral · Cohere · Together AI · Cerebras · Nvidia NIM · Fireworks AI · Hyperbolic · DeepInfra · OpenRouter · HuggingFace · Perplexity · Qwen · SambaNova · Novita AI · AI21 Labs · MonsterAPI · Lepton AI · Cloudflare AI · Replicate · Local models (Ollama)

---

## License

MIT — © Inyang David / Sixpert
