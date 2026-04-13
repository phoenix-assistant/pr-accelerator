#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerReviewersCommand } from './commands/reviewers.js';
import { registerLoadCommand } from './commands/load.js';
import { registerSummarizeCommand } from './commands/summarize.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerCICommand } from './commands/ci.js';

// Read version from package.json
let version = '0.1.0';
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };
  version = pkg.version;
} catch {
  // fallback
}

const program = new Command();

program
  .name('pr-accelerator')
  .description('Cut PR review time from 48h to 4h. Smart reviewer assignment, semantic diff summaries, load balancing.')
  .version(version);

registerAnalyzeCommand(program);
registerReviewersCommand(program);
registerLoadCommand(program);
registerSummarizeCommand(program);
registerSetupCommand(program);
registerCICommand(program);

program.parse(process.argv);
