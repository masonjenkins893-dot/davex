# 🦞 DaveX

![DaveX Demo](https://raw.githubusercontent.com/masonjenkins893-dot/davex/master/src/ui/davex-logo.png)

**AI Coding Agent** — runs in your terminal, connects to Telegram, codes anything, remembers everything.

Made by **Inyang David** @ **Sixpert**

---

## What is DaveX?

DaveX is a coding-first AI agent that works like Claude Code and Gemini CLI in your terminal, but also:

- **Autonomous Operation** — DaveX doesn't just suggest code; it executes, debugs, and deploys. It keeps working until the task is done, no need to babysit it.
- **Telegram Integration** — Connect your bot and take your agent anywhere. Send tasks from your phone, get status updates, and approve actions via Telegram.
- **Deep Memory** — Features short-term session memory for context and long-term memory that survives restarts, allowing it to remember your preferences and project details.

---

## Requirements

Before installing DaveX, ensure your system meets the following requirements:

- **Node.js**: version 20.0.0 or higher
- **Git**: installed and configured
- **Internet Connection**: for AI provider API access

---

## Install

Run the following command in your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/masonjenkins893-dot/davex/master/install.sh | bash
```

Then run:

```bash
davex
```

---

## First run

1. **Logo Display**: DaveX shows its iconic logo.
2. **Workspace Setup**: Approves your current workspace folder.
3. **Telegram Pairing**: Asks for your Telegram bot token (from [@BotFather](https://t.me/BotFather)) and your chat ID.
4. **AI Configuration**: Lets you pick a provider, enter your API key, and choose a model.
5. **Ready**: You're ready to start coding.

---

## Usage

Just type a task:

```
> create a snake game and deploy it to localhost
```

DaveX will build it, run it, and give you the URL — in the terminal and on Telegram.

### Slash commands

| Command | Description |
| :--- | :--- |
| `/providers` | Pick provider + api key + model |
| `/changemodel` | Switch model |
| `/memory` | View or clear memory |
| `/skills` | Manage skills |
| `/mcp` | Add or manage MCP servers |
| `/telegram` | Telegram status |
| `/extensions` | Manage extensions |
| `/theme` | Change terminal theme |
| `/plan` | Toggle plan mode |
| `/localmodel` | Run a local model |
| `/usage` | Token usage |
| `/hooks` | Manage hooks |
| `/help` | All commands |

### Telegram bot commands

Send `/help` to your bot for the full list. Includes session control, goals, kanban board, voice message transcription (via Groq Whisper), and more.

---

## Providers supported

OpenAI · Anthropic · Google Gemini · xAI/Grok · Groq · Mistral · Cohere · Together AI · Cerebras · Nvidia NIM · Fireworks AI · Hyperbolic · DeepInfra · OpenRouter · HuggingFace · Perplexity · Qwen · SambaNova · Novita AI · AI21 Labs · MonsterAPI · Lepton AI · Cloudflare AI · Replicate · Local models (Ollama)

---

## License

MIT — © Inyang David / Sixpert
