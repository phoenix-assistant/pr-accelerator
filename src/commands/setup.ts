import type { Command } from 'commander';
import pc from 'picocolors';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateConfigYaml } from '../utils/config.js';

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Configure pr-accelerator for this repo')
    .option('--force', 'Overwrite existing config')
    .action((opts: { force?: boolean }) => {
      const configPath = join(process.cwd(), '.pr-accelerator.yml');

      if (existsSync(configPath) && !opts.force) {
        console.log(pc.yellow(`Config already exists at ${configPath}`));
        console.log(pc.dim('Use --force to overwrite.'));
        return;
      }

      const yaml = generateConfigYaml();
      writeFileSync(configPath, yaml, 'utf8');
      console.log(pc.green(`✓ Created ${configPath}`));

      // Check for CODEOWNERS
      const codeownersPath = join(process.cwd(), '.github', 'CODEOWNERS');
      if (existsSync(codeownersPath)) {
        console.log(pc.dim('  CODEOWNERS detected — pr-accelerator will enhance (not replace) it.'));
      }

      console.log('');
      console.log(pc.bold('Next steps:'));
      console.log('  1. Edit .pr-accelerator.yml to customize settings');
      console.log('  2. Add to GitHub Actions:');
      console.log('');
      console.log(pc.dim(`     - name: PR Analysis`));
      console.log(pc.dim(`       uses: actions/checkout@v4`));
      console.log(pc.dim(`       with:`));
      console.log(pc.dim(`         fetch-depth: 0`));
      console.log('');
      console.log(pc.dim(`     - name: Run pr-accelerator`));
      console.log(pc.dim(`       run: npx @phoenixaihub/pr-accelerator ci summarize`));
      console.log('');
    });
}
