import type { Command } from 'commander';
import pc from 'picocolors';
import { fetchGitLog, buildFileTFScores } from '../algorithms/expertise.js';
import { fetchReviewerLoads, computeExpectedWait } from '../algorithms/loadbalancer.js';
import { loadConfig } from '../utils/config.js';
import { printSection, printHeader } from '../utils/output.js';

interface LoadOptions {
  repo?: string;
}

export function registerLoadCommand(program: Command): void {
  program
    .command('load')
    .description('Show reviewer load and recommend least-loaded expert')
    .option('-r, --repo <repo>', 'GitHub repo (owner/repo)')
    .action((opts: LoadOptions) => {
      const config = loadConfig();

      console.log(pc.dim('Analyzing codebase experts...'));
      const entries = fetchGitLog({ decayDays: config.expertiseDecayDays });

      if (entries.length === 0) {
        console.error(pc.yellow('No git history found.'));
        process.exit(1);
      }

      const tfScores = buildFileTFScores(entries, config.expertiseDecayDays);
      const globalScores = new Map<string, { author: string; tfidf: number }>();

      for (const [filePath, contribs] of tfScores) {
        for (const [email, data] of contribs) {
          const existing = globalScores.get(email);
          if (existing) {
            existing.tfidf += data.score;
          } else {
            globalScores.set(email, { author: data.author, tfidf: data.score });
          }
        }
      }

      const topReviewers = [...globalScores.entries()]
        .sort((a, b) => b[1].tfidf - a[1].tfidf)
        .slice(0, 10)
        .map((e) => e[1].author);

      console.log(pc.dim(`Fetching reviewer loads for: ${topReviewers.join(', ')}`));
      const loads = fetchReviewerLoads(topReviewers, { repo: opts.repo });

      printHeader('Reviewer Load Dashboard');
      printSection('Current Queue');
      console.log('');

      for (const load of loads) {
        const waitH = computeExpectedWait(load);
        const loadColor = load.openPRs === 0 ? pc.green : load.openPRs <= 3 ? pc.yellow : pc.red;
        console.log(
          `  ${pc.bold(load.reviewer.padEnd(25))} ` +
          `${loadColor(`${load.openPRs} open`.padEnd(10))} ` +
          `avg: ${load.avgReviewTimeHours.toFixed(1)}h  ` +
          `est. wait: ~${waitH.toFixed(1)}h`
        );
        for (const q of load.queue.slice(0, 2)) {
          console.log(`    ${pc.dim('  ' + q)}`);
        }
        if (load.queue.length > 2) {
          console.log(`    ${pc.dim(`  ... and ${load.queue.length - 2} more`)}`);
        }
      }

      const recommended = loads.sort((a, b) => computeExpectedWait(a) - computeExpectedWait(b))[0];
      if (recommended) {
        printSection('Recommendation');
        console.log(`  Assign to: ${pc.bold(pc.green(recommended.reviewer))}`);
        console.log(`  Expected wait: ~${computeExpectedWait(recommended).toFixed(1)}h`);
        console.log(`  Current queue: ${recommended.openPRs} PRs`);
      }
      console.log('');
    });
}
