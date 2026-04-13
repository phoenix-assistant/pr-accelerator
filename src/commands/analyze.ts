import type { Command } from 'commander';
import pc from 'picocolors';
import { fetchPR } from '../utils/github.js';
import { fetchGitLog, scoreContributors } from '../algorithms/expertise.js';
import { fetchReviewerLoads, buildRecommendations } from '../algorithms/loadbalancer.js';
import { groupFilesBySemantics, generateSummary } from '../algorithms/semantic.js';
import { scoreComplexity } from '../algorithms/complexity.js';
import { loadConfig } from '../utils/config.js';
import { printReport } from '../utils/output.js';
import type { AnalysisReport } from '../types/index.js';

interface AnalyzeOptions {
  repo?: string;
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze <pr-number>')
    .description('Full PR analysis: complexity, semantic summary, reviewer recommendations')
    .option('-r, --repo <repo>', 'GitHub repo (owner/repo)')
    .action(async (prNumber: string, opts: AnalyzeOptions) => {
      const n = parseInt(prNumber, 10);
      if (isNaN(n)) {
        console.error(pc.red('Invalid PR number'));
        process.exit(1);
      }

      console.log(pc.dim(`Fetching PR #${n}...`));
      const config = loadConfig();

      let pr;
      try {
        pr = fetchPR(n, opts.repo);
      } catch (err: unknown) {
        console.error(pc.red(`Failed to fetch PR: ${(err as Error).message}`));
        process.exit(1);
      }

      console.log(pc.dim('Analyzing git history...'));
      const entries = fetchGitLog({ decayDays: config.expertiseDecayDays });

      const prFilePaths = pr.files.map((f) => f.path);
      const expertiseScores = scoreContributors(prFilePaths, entries, config.expertiseDecayDays, pr.author);

      let recommendations = [];
      if (config.loadBalancing && expertiseScores.length > 0) {
        const topReviewers = expertiseScores.slice(0, 6).map((e) => e.contributor);
        console.log(pc.dim('Fetching reviewer loads...'));
        const loads = fetchReviewerLoads(topReviewers, { repo: opts.repo });
        recommendations = buildRecommendations(expertiseScores, loads, config.maxReviewersToSuggest);
      } else {
        recommendations = expertiseScores.slice(0, config.maxReviewersToSuggest).map((e) => ({
          reviewer: e.contributor,
          email: e.email,
          score: e.score,
          expertise: e.files.slice(0, 5),
          currentLoad: 0,
          expectedWaitHours: 4,
        }));
      }

      const clusters = groupFilesBySemantics(pr.files);
      const complexity = scoreComplexity(pr.files, pr.additions, pr.deletions);
      const summary = generateSummary(clusters, pr.title);

      const report: AnalysisReport = { pr, complexity, clusters, recommendations, summary };
      printReport(report);
    });
}
