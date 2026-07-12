#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import fs from 'fs-extra';
import { initDb } from './storage/db.js';
import { isFirstRun } from './config/settings.js';
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

async function bootstrap(): Promise<void> {
  await fs.ensureDir(DAVEX_HOME);
  await initDb(); // init database + run migrations
  await initTools();
  await loadSkills();
  await loadExtensions();
  await connectMcpServers();
  await startTelegramBot().catch(err => {
    console.error('Telegram bot failed to start:', err.message);
  });
}

async function main(): Promise<void> {
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
      await bootstrap();

      if (opts.acp) {
        startAcpServer(process.cwd());
        return;
      }

      if (opts.providers) {
        await runProvidersWizardCLI();
        process.exit(0);
      }

      if (opts.changemodel) {
        await runChangeModelCLI();
        process.exit(0);
      }

      if (isFirstRun()) {
        render(React.createElement(Wizard, {
          onDone: () => {
            render(React.createElement(App));
          },
        }));
      } else {
        render(React.createElement(App));
      }
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.error('DaveX failed to start:', err);
  process.exit(1);
});
