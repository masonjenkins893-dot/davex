#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import fs from 'fs-extra';
import { getDb, isDbConfigured } from './storage/db.js';
import { isFirstRun, hydrateEnvFromSettings } from './config/settings.js';
import { initTools } from './tools/registry.js';
import { startTelegramBot } from './telegram/bot.js';
import { connectMcpServers } from './mcp/manager.js';
import { loadSkills } from './skills/manager.js';
import { loadExtensions } from './extensions/manager.js';
import { App } from './ui/app.js';
import { Wizard } from './ui/wizard.js';
import { startAcpServer } from './ide/acp.js';
import { runProvidersWizardCLI, runChangeModelCLI } from './commands/providers.js';
import { DAVEX_VERSION, DAVEX_AUTHOR, DAVEX_COMPANY, DAVEX_HOME } from './config/constants.js';

// Never let a background failure (bad network, Telegram unreachable, a
// provider timing out, etc.) take down the whole terminal session. Log it
// and keep going — this is the difference between "Telegram couldn't
// connect" and the entire app crashing with a stack trace.
process.on('uncaughtException', (err) => {
  console.error('\n⚠️  Unexpected error (recovered):', err.message);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('\n⚠️  Unexpected error (recovered):', reason?.message ?? reason);
});

/** Sets the terminal tab/window title, e.g. Terminal.app, iTerm2, most
 * Linux/Android terminal emulators. Ink itself never touches this, so
 * without it the tab just shows "node" or the shell's default title. */
function setTerminalTitle(title: string): void {
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]2;${title}\x07`);
  }
}

async function bootstrap(): Promise<void> {
  await fs.ensureDir(DAVEX_HOME);
  hydrateEnvFromSettings();

  if (!isDbConfigured()) {
    // First run — Supabase credentials haven't been entered yet. Nothing
    // that touches the database can run until the wizard collects them.
    return;
  }

  getDb(); // just validates the client can be constructed
  await initTools();
  await loadSkills().catch(err => console.error('Failed to load skills:', err.message));
  await loadExtensions().catch(err => console.error('Failed to load extensions:', err.message));
  await connectMcpServers().catch(err => console.error('Failed to connect MCP servers:', err.message));
  await startTelegramBot().catch(err => {
    console.error('Telegram bot failed to start:', err.message);
  });
}

async function main(): Promise<void> {
  setTerminalTitle('DaveX');

  const program = new Command();

  program
    .name('davex')
    .description('DaveX — AI Coding Agent, by Inyang David @ Sixpert')
    .version(DAVEX_VERSION);

  program
    .option('--acp', 'Run in ACP mode for IDE integration')
    .option('--providers', 'Run provider setup wizard')
    .option('--changemodel', 'Change active model')
    .action(async (opts) => {
      hydrateEnvFromSettings();

      if (opts.acp) {
        await bootstrap();
        startAcpServer(process.cwd());
        return;
      }

      if (isFirstRun() || !isDbConfigured()) {
        // Wizard collects the Supabase URL/key (among other things) and
        // calls bootstrap() itself once they're saved, then renders App.
        render(React.createElement(Wizard, {
          onDone: async () => {
            await bootstrap();
            if (opts.providers) { await runProvidersWizardCLI(); process.exit(0); }
            if (opts.changemodel) { await runChangeModelCLI(); process.exit(0); }
            render(React.createElement(App));
          },
        }));
        return;
      }

      await bootstrap();

      if (opts.providers) {
        await runProvidersWizardCLI();
        process.exit(0);
      }

      if (opts.changemodel) {
        await runChangeModelCLI();
        process.exit(0);
      }

      render(React.createElement(App));
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.error('DaveX failed to start:', err);
  process.exit(1);
});
