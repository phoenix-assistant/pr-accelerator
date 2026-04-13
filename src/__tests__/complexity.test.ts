import { describe, it, expect } from 'vitest';
import { scoreComplexity } from '../algorithms/complexity.js';
import type { PRFile } from '../types/index.js';

function mockFile(path: string, additions = 10, deletions = 5, status: PRFile['status'] = 'modified'): PRFile {
  return { path, additions, deletions, status };
}

describe('scoreComplexity', () => {
  it('returns trivial for tiny PRs', () => {
    const files = [mockFile('src/utils.ts', 5, 2)];
    const result = scoreComplexity(files, 5, 2);
    expect(result.level).toBe('trivial');
    expect(result.score).toBeLessThan(20);
  });

  it('returns complex for large PRs', () => {
    const files = Array.from({ length: 25 }, (_, i) =>
      mockFile(`src/auth/service${i}.ts`, 40, 20)
    );
    const result = scoreComplexity(files, 1500, 800);
    expect(['complex', 'critical']).toContain(result.level);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('penalizes auth/api files', () => {
    const safeFiles = [mockFile('src/helpers.ts', 50, 20)];
    const riskFiles = [mockFile('src/auth/login.ts', 50, 20)];

    const safeResult = scoreComplexity(safeFiles, 50, 20);
    const riskResult = scoreComplexity(riskFiles, 50, 20);
    expect(riskResult.score).toBeGreaterThan(safeResult.score);
  });

  it('penalizes deleted files more than added', () => {
    const withDeleted = [
      mockFile('src/a.ts', 5, 5, 'deleted'),
      mockFile('src/b.ts', 5, 5, 'deleted'),
      mockFile('src/c.ts', 5, 5, 'deleted'),
    ];
    const withAdded = [
      mockFile('src/a.ts', 5, 5, 'added'),
      mockFile('src/b.ts', 5, 5, 'added'),
      mockFile('src/c.ts', 5, 5, 'added'),
    ];
    const deletedResult = scoreComplexity(withDeleted, 15, 15);
    const addedResult = scoreComplexity(withAdded, 15, 15);
    expect(deletedResult.score).toBeGreaterThanOrEqual(addedResult.score);
  });

  it('includes all factors', () => {
    const files = [mockFile('src/auth.ts', 100, 50)];
    const result = scoreComplexity(files, 100, 50);
    expect(result.factors).toHaveLength(6);
    expect(result.estimatedReviewMinutes).toBeGreaterThan(0);
  });

  it('caps at 100', () => {
    const files = Array.from({ length: 50 }, (_, i) =>
      mockFile(`src/auth/service${i}.ts`, 200, 100, i % 3 === 0 ? 'deleted' : 'modified')
    );
    const result = scoreComplexity(files, 10000, 5000);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
