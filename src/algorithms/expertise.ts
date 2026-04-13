/**
 * Expertise scoring using TF-IDF on git log.
 * 
 * For each file in the PR:
 *   - Find all contributors with commit history touching that file
 *   - Weight by: recency (exponential decay, 90-day half-life) × commit frequency × lines touched
 *   - Apply IDF: rare file expertise weighted higher than common-file expertise
 * 
 * Final score = sum over PR files of: TF(contributor, file) × IDF(file)
 */

import { runCommandSafe } from '../utils/exec.js';
import type { GitLogEntry, ExpertiseScore, FileChange } from '../types/index.js';

export interface GitLogOptions {
  cwd?: string;
  since?: string;
  maxCommits?: number;
  decayDays?: number;
}

export function parseGitLog(rawLog: string): GitLogEntry[] {
  const entries: GitLogEntry[] = [];
  // Format: hash|author|email|date\n--\nfiles...
  const blocks = rawLog.split('\x00COMMIT\x00').filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length === 0) continue;
    const header = lines[0].split('|');
    if (header.length < 4) continue;

    const [hash, author, email, date, ...msgParts] = header;
    const message = msgParts.join('|');
    const files: FileChange[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // numstat format: additions \t deletions \t filepath
      const parts = line.split('\t');
      if (parts.length >= 3) {
        files.push({
          path: parts[2],
          additions: parseInt(parts[0], 10) || 0,
          deletions: parseInt(parts[1], 10) || 0,
        });
      }
    }

    if (hash && author && email) {
      entries.push({ hash, author, email, date, message, files });
    }
  }
  return entries;
}

export function fetchGitLog(opts: GitLogOptions = {}): GitLogEntry[] {
  const { cwd, since = '2 years ago', maxCommits = 2000 } = opts;
  // Use a unique separator to avoid issues with commit messages
  const format = '%x00COMMIT%x00%n%H|%an|%ae|%ai|%s';
  const cmd = `git log --numstat --format="${format}" --since="${since}" -n ${maxCommits}`;
  const raw = runCommandSafe(cmd, cwd);
  if (!raw) return [];
  return parseGitLog(raw);
}

export function computeRecencyWeight(dateStr: string, decayDays = 90): number {
  const commitDate = new Date(dateStr).getTime();
  if (isNaN(commitDate)) return 0.1;
  const now = Date.now();
  const ageDays = (now - commitDate) / (1000 * 60 * 60 * 24);
  // Exponential decay: weight = e^(-lambda * ageDays), where lambda = ln(2)/half-life
  const lambda = Math.LN2 / decayDays;
  return Math.exp(-lambda * ageDays);
}

/**
 * Build per-file contributor scores (TF part).
 * Returns Map<filepath, Map<contributor_email, score>>
 */
export function buildFileTFScores(
  entries: GitLogEntry[],
  decayDays = 90
): Map<string, Map<string, { score: number; author: string; email: string; commits: number; lines: number }>> {
  const fileScores = new Map<string, Map<string, { score: number; author: string; email: string; commits: number; lines: number }>>();

  for (const entry of entries) {
    const recency = computeRecencyWeight(entry.date, decayDays);
    for (const file of entry.files) {
      if (!fileScores.has(file.path)) {
        fileScores.set(file.path, new Map());
      }
      const contributors = fileScores.get(file.path)!;
      const existing = contributors.get(entry.email);
      const lines = file.additions + file.deletions;
      const contribution = recency * (1 + Math.log1p(lines));

      if (existing) {
        existing.score += contribution;
        existing.commits += 1;
        existing.lines += lines;
      } else {
        contributors.set(entry.email, {
          score: contribution,
          author: entry.author,
          email: entry.email,
          commits: 1,
          lines,
        });
      }
    }
  }
  return fileScores;
}

/**
 * Compute IDF for each file.
 * IDF = log(total_files / (1 + files_with_contributor))
 * But here we use: IDF = log(total_commits / (1 + commits_touching_file))
 */
export function computeIDF(fileScores: Map<string, Map<string, unknown>>, totalCommits: number): Map<string, number> {
  const idf = new Map<string, number>();
  for (const [file, contributors] of fileScores) {
    const commitCount = Array.from(contributors.values()).length;
    idf.set(file, Math.log((totalCommits + 1) / (commitCount + 1)));
  }
  return idf;
}

/**
 * Score contributors for a specific set of PR files.
 * Returns ranked list of expertise scores.
 */
export function scoreContributors(
  prFiles: string[],
  entries: GitLogEntry[],
  decayDays = 90,
  excludeAuthor?: string
): ExpertiseScore[] {
  const tfScores = buildFileTFScores(entries, decayDays);
  const idf = computeIDF(tfScores, entries.length);

  // Aggregate TF-IDF per contributor across all PR files
  const contrib = new Map<string, { author: string; email: string; tfidf: number; commits: number; lines: number; files: Set<string> }>();

  for (const filePath of prFiles) {
    const fileContribs = tfScores.get(filePath);
    if (!fileContribs) continue;
    const idfWeight = idf.get(filePath) ?? 1;

    for (const [email, data] of fileContribs) {
      if (excludeAuthor && (email === excludeAuthor || data.author === excludeAuthor)) continue;
      const tfidfScore = data.score * idfWeight;
      const existing = contrib.get(email);
      if (existing) {
        existing.tfidf += tfidfScore;
        existing.commits += data.commits;
        existing.lines += data.lines;
        existing.files.add(filePath);
      } else {
        contrib.set(email, {
          author: data.author,
          email,
          tfidf: tfidfScore,
          commits: data.commits,
          lines: data.lines,
          files: new Set([filePath]),
        });
      }
    }
  }

  const results: ExpertiseScore[] = [];
  for (const [email, data] of contrib) {
    results.push({
      contributor: data.author,
      email,
      score: data.tfidf,
      commits: data.commits,
      recencyWeight: 0, // aggregated
      linesChanged: data.lines,
      files: Array.from(data.files),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Get expertise rankings for a specific file or directory.
 */
export function getFileExpertise(
  filePath: string,
  entries: GitLogEntry[],
  decayDays = 90
): ExpertiseScore[] {
  return scoreContributors([filePath], entries, decayDays);
}
