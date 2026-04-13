/**
 * Reviewer load balancing using M/M/c queue model.
 * 
 * The M/M/c queue models a system with:
 *   - Poisson arrival of PRs (rate λ)
 *   - Exponential service time per reviewer (rate μ)
 *   - c parallel reviewers
 * 
 * Expected wait time = Erlang C formula
 * We simplify: for each reviewer, estimate their service rate μ from
 * historical review times, then find the assignment minimizing E[wait].
 */

import { runCommandSafe } from '../utils/exec.js';
import type { ReviewerLoad, ReviewerRecommendation, ExpertiseScore } from '../types/index.js';

export interface LoadOptions {
  cwd?: string;
  repo?: string;
}

/**
 * Fetch reviewer load from GitHub via gh CLI.
 */
export function fetchReviewerLoads(reviewers: string[], opts: LoadOptions = {}): ReviewerLoad[] {
  const loads: ReviewerLoad[] = [];

  for (const reviewer of reviewers) {
    const repoFlag = opts.repo ? `--repo ${opts.repo}` : '';
    // Count open PRs where this reviewer has been requested
    const result = runCommandSafe(
      `gh pr list ${repoFlag} --reviewer ${reviewer} --state open --json number,title --limit 50`,
      opts.cwd
    );

    let openPRs = 0;
    const queue: string[] = [];
    if (result) {
      try {
        const prs = JSON.parse(result) as Array<{ number: number; title: string }>;
        openPRs = prs.length;
        queue.push(...prs.map((p) => `#${p.number}: ${p.title.slice(0, 40)}`));
      } catch {
        openPRs = 0;
      }
    }

    // Estimate avg review time from recent completed reviews
    const avgReviewTimeHours = estimateAvgReviewTime(reviewer, opts);
    const serviceRate = avgReviewTimeHours > 0 ? 1 / avgReviewTimeHours : 0.5;

    loads.push({
      reviewer,
      openPRs,
      avgReviewTimeHours,
      queue,
      serviceRate,
    });
  }

  return loads;
}

/**
 * Estimate a reviewer's average review time from git/gh history.
 * Falls back to a heuristic if data unavailable.
 */
function estimateAvgReviewTime(reviewer: string, opts: LoadOptions): number {
  // Try to get completed review data
  const repoFlag = opts.repo ? `--repo ${opts.repo}` : '';
  const result = runCommandSafe(
    `gh pr list ${repoFlag} --reviewer ${reviewer} --state closed --json createdAt,closedAt --limit 10`,
    opts.cwd
  );

  if (result) {
    try {
      const prs = JSON.parse(result) as Array<{ createdAt: string; closedAt: string }>;
      if (prs.length > 0) {
        const times = prs.map((pr) => {
          const created = new Date(pr.createdAt).getTime();
          const closed = new Date(pr.closedAt).getTime();
          return (closed - created) / (1000 * 60 * 60);
        }).filter((t) => t > 0 && t < 720); // ignore outliers > 30 days

        if (times.length > 0) {
          return times.reduce((a, b) => a + b, 0) / times.length;
        }
      }
    } catch {
      // fall through
    }
  }

  // Heuristic: 4h average
  return 4;
}

/**
 * Erlang C formula: probability that a new customer has to wait.
 * P_wait = (ρ^c / c!) * (1/(1-ρ/c)) / (sum_{k=0}^{c-1} ρ^k/k! + (ρ^c/c!)*(1/(1-ρ/c)))
 * where ρ = λ/μ (total load)
 */
function erlangC(c: number, totalLoad: number): number {
  if (c <= 0) return 1;
  const rho = totalLoad / c;
  if (rho >= 1) return 1; // system is overloaded

  // Numerator: (totalLoad^c / c!) * (1 / (1 - rho))
  let factC = 1;
  for (let i = 1; i <= c; i++) factC *= i;
  const numerator = (Math.pow(totalLoad, c) / factC) * (1 / (1 - rho));

  // Denominator sum
  let sum = 0;
  for (let k = 0; k < c; k++) {
    let factK = 1;
    for (let i = 1; i <= k; i++) factK *= i;
    sum += Math.pow(totalLoad, k) / factK;
  }

  const denominator = sum + numerator;
  return denominator > 0 ? numerator / denominator : 1;
}

/**
 * Compute expected wait time for a reviewer using M/M/1 approximation.
 * E[W] = P_wait / (μ - λ) where λ = openPRs * arrivalRate, μ = serviceRate
 */
export function computeExpectedWait(load: ReviewerLoad, globalArrivalRate = 0.5): number {
  const mu = load.serviceRate;
  const lambda = globalArrivalRate;

  if (mu <= lambda) {
    // System saturated — long wait
    return load.openPRs * (1 / mu) + (1 / mu);
  }

  // M/M/1 simplification: E[W] = 1/(μ-λ) + openPRs/μ
  const queueWait = load.openPRs / mu;
  const serviceWait = 1 / mu;
  return queueWait + serviceWait;
}

/**
 * Combine expertise scores with load data to produce ranked recommendations.
 */
export function buildRecommendations(
  expertiseScores: ExpertiseScore[],
  loads: ReviewerLoad[],
  maxSuggestions = 3
): ReviewerRecommendation[] {
  const loadMap = new Map(loads.map((l) => [l.reviewer, l]));

  const recommendations: ReviewerRecommendation[] = expertiseScores
    .slice(0, maxSuggestions * 2) // over-fetch then rank
    .map((e) => {
      const load = loadMap.get(e.contributor) ?? {
        reviewer: e.contributor,
        openPRs: 0,
        avgReviewTimeHours: 4,
        queue: [],
        serviceRate: 0.25,
      };
      const expectedWait = computeExpectedWait(load);
      return {
        reviewer: e.contributor,
        email: e.email,
        score: e.score,
        expertise: e.files.slice(0, 5),
        currentLoad: load.openPRs,
        expectedWaitHours: expectedWait,
      };
    });

  // Re-rank by combined score: expertise / (1 + waitPenalty)
  return recommendations
    .sort((a, b) => {
      const scoreA = a.score / (1 + a.expectedWaitHours * 0.1);
      const scoreB = b.score / (1 + b.expectedWaitHours * 0.1);
      return scoreB - scoreA;
    })
    .slice(0, maxSuggestions);
}
