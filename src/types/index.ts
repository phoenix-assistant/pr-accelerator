// Core types for pr-accelerator

export interface GitLogEntry {
  hash: string;
  author: string;
  email: string;
  date: string;
  files: FileChange[];
  message: string;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
}

export interface ExpertiseScore {
  contributor: string;
  email: string;
  score: number;
  commits: number;
  recencyWeight: number;
  linesChanged: number;
  files: string[];
}

export interface ReviewerRecommendation {
  reviewer: string;
  email: string;
  score: number;
  expertise: string[];
  currentLoad: number;
  expectedWaitHours: number;
}

export interface PRInfo {
  number: number;
  title: string;
  author: string;
  body: string;
  files: PRFile[];
  additions: number;
  deletions: number;
  changedFiles: number;
  draft: boolean;
  reviewRequests: string[];
}

export interface PRFile {
  path: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  patch?: string;
}

export interface FileCluster {
  label: string;
  files: string[];
  additions: number;
  deletions: number;
  type: ClusterType;
}

export type ClusterType =
  | 'test'
  | 'config'
  | 'auth'
  | 'api'
  | 'ui'
  | 'docs'
  | 'deps'
  | 'ci'
  | 'core'
  | 'other';

export interface ReviewComplexity {
  score: number; // 0–100
  level: 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical';
  factors: ComplexityFactor[];
  estimatedReviewMinutes: number;
}

export interface ComplexityFactor {
  name: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface ReviewerLoad {
  reviewer: string;
  openPRs: number;
  avgReviewTimeHours: number;
  queue: string[];
  serviceRate: number; // PRs per hour
}

export interface Config {
  minReviewers: number;
  autoAssign: boolean;
  ignorePaths: string[];
  expertiseDecayDays: number;
  maxReviewersToSuggest: number;
  loadBalancing: boolean;
}

export interface AnalysisReport {
  pr: PRInfo;
  complexity: ReviewComplexity;
  clusters: FileCluster[];
  recommendations: ReviewerRecommendation[];
  summary: string;
}
