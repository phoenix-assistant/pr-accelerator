import { describe, it, expect } from 'vitest';
import { parseGitLog, computeRecencyWeight, scoreContributors, buildFileTFScores } from '../algorithms/expertise.js';
import type { GitLogEntry } from '../types/index.js';

const MOCK_GIT_LOG = `\x00COMMIT\x00
abc123|Alice Smith|alice@example.com|2024-01-15T10:00:00Z|feat: add auth module
5\t2\tsrc/auth/login.ts
3\t1\tsrc/auth/token.ts
\x00COMMIT\x00
def456|Bob Jones|bob@example.com|2024-01-10T09:00:00Z|fix: auth bug
2\t1\tsrc/auth/login.ts
10\t5\tsrc/api/users.ts
\x00COMMIT\x00
ghi789|Alice Smith|alice@example.com|2023-10-01T08:00:00Z|refactor: cleanup
1\t1\tsrc/auth/login.ts
4\t0\tsrc/utils/helpers.ts`;

describe('parseGitLog', () => {
  it('parses commit entries correctly', () => {
    const entries = parseGitLog(MOCK_GIT_LOG);
    expect(entries).toHaveLength(3);
    expect(entries[0].author).toBe('Alice Smith');
    expect(entries[0].email).toBe('alice@example.com');
    expect(entries[0].files).toHaveLength(2);
    expect(entries[0].files[0].path).toBe('src/auth/login.ts');
    expect(entries[0].files[0].additions).toBe(5);
    expect(entries[0].files[0].deletions).toBe(2);
  });

  it('handles empty input', () => {
    expect(parseGitLog('')).toHaveLength(0);
  });
});

describe('computeRecencyWeight', () => {
  it('returns ~1.0 for very recent commits', () => {
    const now = new Date().toISOString();
    const w = computeRecencyWeight(now, 90);
    expect(w).toBeCloseTo(1.0, 1);
  });

  it('returns ~0.5 at the half-life', () => {
    const halfLifeDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const w = computeRecencyWeight(halfLifeDate, 90);
    expect(w).toBeCloseTo(0.5, 1);
  });

  it('returns lower weight for older commits', () => {
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeRecencyWeight(old)).toBeLessThan(computeRecencyWeight(recent));
  });

  it('handles invalid date', () => {
    expect(computeRecencyWeight('invalid-date')).toBe(0.1);
  });
});

describe('scoreContributors', () => {
  const entries = parseGitLog(MOCK_GIT_LOG);

  it('ranks contributors by expertise', () => {
    const scores = scoreContributors(['src/auth/login.ts'], entries);
    expect(scores.length).toBeGreaterThan(0);
    // Alice has 2 commits to login.ts, Bob has 1
    const alice = scores.find((s) => s.contributor === 'Alice Smith');
    const bob = scores.find((s) => s.contributor === 'Bob Jones');
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice!.score).toBeGreaterThan(bob!.score);
  });

  it('excludes the PR author', () => {
    const scores = scoreContributors(['src/auth/login.ts'], entries, 90, 'alice@example.com');
    expect(scores.find((s) => s.email === 'alice@example.com')).toBeUndefined();
  });

  it('returns empty for unknown files', () => {
    const scores = scoreContributors(['src/nonexistent/file.ts'], entries);
    expect(scores).toHaveLength(0);
  });

  it('handles multiple PR files', () => {
    const scores = scoreContributors(
      ['src/auth/login.ts', 'src/api/users.ts'],
      entries
    );
    // Bob touched api/users.ts, so his aggregate should be higher
    expect(scores.length).toBeGreaterThan(0);
  });
});

describe('buildFileTFScores', () => {
  it('builds per-file scores', () => {
    const entries = parseGitLog(MOCK_GIT_LOG);
    const scores = buildFileTFScores(entries);
    expect(scores.has('src/auth/login.ts')).toBe(true);
    const loginContribs = scores.get('src/auth/login.ts')!;
    expect(loginContribs.has('alice@example.com')).toBe(true);
    expect(loginContribs.get('alice@example.com')!.commits).toBe(2);
  });
});
