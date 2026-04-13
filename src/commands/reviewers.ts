import type { Command } from 'commander';
import pc from 'picocolors';
import { fetchGitLog, getFileExpertise, buildFileTFScores, computeIDF } from '../algorithms/expertise.js';
import { loadConfig } from '../utils/config.js';
import { printSection } from '../utils/output.js';

interface ReviewersOptions {
  file?: string;
  limit?: string;
}

export function registerReviewersCommand(program: Command): void {
  program
    .command('reviewers')
    .description('Show expertise rankings for the codebase or a specific file')
    .option('-f, --file <path>', 'Show expertise for a specific file or directory')
    .option('-n, --limit <n>', 'Number of reviewers to show', '10')
    .action((opts: ReviewersOptions) => {
      const config = loadConfig();
      const limit = parseInt(opts.limit ?? '10', 10);

      console.log(pc.dim('Parsing git history...'));
      const entries = fetchGitLog({ decayDays: config.expertiseDecayDays });

      if (entries.length === 0) {
        console.error(pc.yellow('No git history found. Run this inside a git repository.'));
        process.exit(1);
      }

      if (opts.file) {
        // Show expertise for specific file
        printSection(`Expertise: ${opts.file}`);
        const scores = getFileExpertise(opts.file, entries, config.expertiseDecayDays);
        if (scores.length === 0) {
          console.log(pc.yellow('  No contributors found for this file.'));
        } else {
          scores.slice(0, limit).forEach((s, i) => {
            console.log(`  ${(i + 1).toString().padStart(2)}. ${pc.bold(s.contributor.padEnd(25))} score: ${s.score.toFixed(2).padStart(8)}  commits: ${s.commits}`);
          });
        }
      } else {
        // Show top contributors per area
        const tfScores = buildFileTFScores(entries, config.expertiseDecayDays);
        const idf = computeIDF(tfScores, entries.length);

        // Aggregate per contributor across all files
        const globalScores = new Map<string, { author: string; tfidf: number; commits: number; topFiles: string[] }>();

        for (const [filePath, contribs] of tfScores) {
          const idfWeight = idf.get(filePath) ?? 1;
          for (const [email, data] of contribs) {
            const existing = globalScores.get(email);
            const contribution = data.score * idfWeight;
            if (existing) {
              existing.tfidf += contribution;
              existing.commits += data.commits;
              if (existing.topFiles.length < 3) existing.topFiles.push(filePath);
            } else {
              globalScores.set(email, {
                author: data.author,
                tfidf: contribution,
                commits: data.commits,
                topFiles: [filePath],
              });
            }
          }
        }

        const ranked = [...globalScores.entries()]
          .sort((a, b) => b[1].tfidf - a[1].tfidf)
          .slice(0, limit);

        printSection('Overall Codebase Expertise Rankings');
        console.log('');
        ranked.forEach(([_email, data], i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${(i + 1).toString().padStart(2)}.`;
          console.log(`  ${medal} ${pc.bold(data.author.padEnd(25))} score: ${data.tfidf.toFixed(2).padStart(8)}  commits: ${data.commits}`);
          if (data.topFiles.length > 0) {
            console.log(`      Top areas: ${pc.dim(data.topFiles.join(', '))}`);
          }
        });
        console.log('');
      }
    });
}
