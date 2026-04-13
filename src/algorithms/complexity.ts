/**
 * PR review complexity scoring.
 * Score 0–100: trivial (<20), simple (20-40), moderate (40-60), complex (60-80), critical (80+)
 */

import type { PRFile, ReviewComplexity, ComplexityFactor } from '../types/index.js';

export function scoreComplexity(
  files: PRFile[],
  additions: number,
  deletions: number
): ReviewComplexity {
  const factors: ComplexityFactor[] = [];

  // 1. LOC changed (max contribution: 25)
  const totalLOC = additions + deletions;
  const locScore = Math.min(25, (totalLOC / 500) * 25);
  factors.push({ name: 'Lines changed', value: totalLOC, weight: 25, contribution: locScore });

  // 2. Files touched (max: 20)
  const fileScore = Math.min(20, (files.length / 20) * 20);
  factors.push({ name: 'Files touched', value: files.length, weight: 20, contribution: fileScore });

  // 3. New files (max: 15)
  const newFiles = files.filter((f) => f.status === 'added').length;
  const newFileScore = Math.min(15, (newFiles / 10) * 15);
  factors.push({ name: 'New files', value: newFiles, weight: 15, contribution: newFileScore });

  // 4. Deleted files (max: 10) — deletions require careful review
  const deletedFiles = files.filter((f) => f.status === 'deleted').length;
  const deletedScore = Math.min(10, (deletedFiles / 5) * 10);
  factors.push({ name: 'Deleted files', value: deletedFiles, weight: 10, contribution: deletedScore });

  // 5. Cross-directory spread (max: 15)
  const dirs = new Set(files.map((f) => f.path.split('/')[0]));
  const spreadScore = Math.min(15, ((dirs.size - 1) / 8) * 15);
  factors.push({ name: 'Directory spread', value: dirs.size, weight: 15, contribution: spreadScore });

  // 6. High-risk areas (auth, api, config) — max: 15
  const riskCount = files.filter((f) =>
    /\b(auth|login|token|jwt|oauth|permission|api|route|config|env)\b/i.test(f.path)
  ).length;
  const riskScore = Math.min(15, (riskCount / 5) * 15);
  factors.push({ name: 'High-risk areas', value: riskCount, weight: 15, contribution: riskScore });

  const score = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0));

  let level: ReviewComplexity['level'];
  if (score < 20) level = 'trivial';
  else if (score < 40) level = 'simple';
  else if (score < 60) level = 'moderate';
  else if (score < 80) level = 'complex';
  else level = 'critical';

  // Estimate review time: base 5min + scaled by score
  const estimatedReviewMinutes = Math.round(5 + score * 2.5);

  return { score, level, factors, estimatedReviewMinutes };
}
