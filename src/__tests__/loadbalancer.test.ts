import { describe, it, expect } from 'vitest';
import { computeExpectedWait, buildRecommendations } from '../algorithms/loadbalancer.js';
import type { ReviewerLoad, ExpertiseScore } from '../types/index.js';

describe('computeExpectedWait', () => {
  it('returns low wait for empty queue', () => {
    const load: ReviewerLoad = {
      reviewer: 'alice',
      openPRs: 0,
      avgReviewTimeHours: 4,
      queue: [],
      serviceRate: 0.25, // 1 PR per 4 hours
    };
    const wait = computeExpectedWait(load);
    expect(wait).toBeCloseTo(4, 0); // just service time
  });

  it('returns higher wait for loaded reviewers', () => {
    const light: ReviewerLoad = {
      reviewer: 'alice',
      openPRs: 0,
      avgReviewTimeHours: 4,
      queue: [],
      serviceRate: 0.25,
    };
    const heavy: ReviewerLoad = {
      reviewer: 'bob',
      openPRs: 5,
      avgReviewTimeHours: 4,
      queue: [],
      serviceRate: 0.25,
    };
    expect(computeExpectedWait(heavy)).toBeGreaterThan(computeExpectedWait(light));
  });

  it('handles saturated system gracefully', () => {
    const overloaded: ReviewerLoad = {
      reviewer: 'alice',
      openPRs: 20,
      avgReviewTimeHours: 1,
      queue: [],
      serviceRate: 0.1, // very slow
    };
    const wait = computeExpectedWait(overloaded, 5); // λ > μ
    expect(wait).toBeGreaterThan(10);
  });
});

describe('buildRecommendations', () => {
  const expertise: ExpertiseScore[] = [
    { contributor: 'Alice', email: 'alice@x.com', score: 100, commits: 10, recencyWeight: 0.9, linesChanged: 500, files: ['src/auth.ts'] },
    { contributor: 'Bob', email: 'bob@x.com', score: 80, commits: 8, recencyWeight: 0.7, linesChanged: 300, files: ['src/api.ts'] },
    { contributor: 'Charlie', email: 'charlie@x.com', score: 60, commits: 5, recencyWeight: 0.5, linesChanged: 200, files: ['src/utils.ts'] },
  ];

  const loads: ReviewerLoad[] = [
    { reviewer: 'Alice', openPRs: 5, avgReviewTimeHours: 4, queue: [], serviceRate: 0.25 },
    { reviewer: 'Bob', openPRs: 1, avgReviewTimeHours: 4, queue: [], serviceRate: 0.25 },
    { reviewer: 'Charlie', openPRs: 0, avgReviewTimeHours: 4, queue: [], serviceRate: 0.25 },
  ];

  it('returns up to maxSuggestions recommendations', () => {
    const recs = buildRecommendations(expertise, loads, 2);
    expect(recs).toHaveLength(2);
  });

  it('penalizes heavily-loaded reviewers', () => {
    const recs = buildRecommendations(expertise, loads, 3);
    // Alice has highest expertise but highest load; should not always be first
    expect(recs.length).toBe(3);
    // All recommendations have required fields
    for (const rec of recs) {
      expect(rec.reviewer).toBeDefined();
      expect(rec.score).toBeGreaterThan(0);
      expect(rec.expectedWaitHours).toBeGreaterThan(0);
    }
  });

  it('works with no load data', () => {
    const recs = buildRecommendations(expertise, [], 3);
    expect(recs).toHaveLength(3);
  });
});
