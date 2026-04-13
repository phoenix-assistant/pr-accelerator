import { runCommand, runCommandSafe } from '../utils/exec.js';
import type { PRInfo, PRFile } from '../types/index.js';

interface GhPRFile {
  path: string;
  additions: number;
  deletions: number;
  status: string;
  patch?: string;
}

interface GhPR {
  number: number;
  title: string;
  author: { login: string };
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  isDraft: boolean;
  reviewRequests: Array<{ login: string }>;
  files?: GhPRFile[];
}

export function fetchPR(prNumber: number, repo?: string, cwd?: string): PRInfo {
  const repoFlag = repo ? `--repo ${repo}` : '';

  // Fetch PR metadata
  const prJson = runCommand(
    `gh pr view ${prNumber} ${repoFlag} --json number,title,author,body,additions,deletions,changedFiles,isDraft,reviewRequests`,
    cwd
  );

  const pr = JSON.parse(prJson) as GhPR;

  // Fetch files
  const filesJson = runCommandSafe(
    `gh pr diff ${prNumber} ${repoFlag} --name-only`,
    cwd
  );

  // Also get file stats
  const filesStatJson = runCommandSafe(
    `gh api repos/{owner}/{repo}/pulls/${prNumber}/files --paginate`,
    cwd
  );

  let files: PRFile[] = [];
  if (filesStatJson) {
    try {
      const raw = JSON.parse(filesStatJson) as GhPRFile[];
      files = raw.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        status: (f.status as PRFile['status']) ?? 'modified',
        patch: f.patch,
      }));
    } catch {
      // fallback: parse name-only output
      if (filesJson) {
        files = filesJson.split('\n').filter(Boolean).map((p) => ({
          path: p,
          additions: 0,
          deletions: 0,
          status: 'modified' as const,
        }));
      }
    }
  }

  return {
    number: pr.number,
    title: pr.title,
    author: pr.author?.login ?? 'unknown',
    body: pr.body ?? '',
    files,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    draft: pr.isDraft,
    reviewRequests: (pr.reviewRequests ?? []).map((r) => r.login),
  };
}

export function assignReviewers(prNumber: number, reviewers: string[], repo?: string, cwd?: string): void {
  const repoFlag = repo ? `--repo ${repo}` : '';
  const reviewerList = reviewers.join(',');
  runCommand(`gh pr edit ${prNumber} ${repoFlag} --add-reviewer ${reviewerList}`, cwd);
}

export function postComment(prNumber: number, body: string, repo?: string, cwd?: string): void {
  const repoFlag = repo ? `--repo ${repo}` : '';
  // Escape body for shell
  const escaped = body.replace(/'/g, "'\\''");
  runCommand(`gh pr comment ${prNumber} ${repoFlag} --body '${escaped}'`, cwd);
}

export function getCurrentPRNumber(cwd?: string): number | null {
  // Try env vars first (GitHub Actions)
  const fromEnv = process.env['GITHUB_PR_NUMBER'] ?? process.env['PR_NUMBER'];
  if (fromEnv) return parseInt(fromEnv, 10);

  // Try gh CLI
  const result = runCommandSafe('gh pr view --json number -q .number', cwd);
  if (result) {
    const n = parseInt(result.trim(), 10);
    if (!isNaN(n)) return n;
  }
  return null;
}
