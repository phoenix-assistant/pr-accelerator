/**
 * Semantic grouping of changed files.
 * 
 * Strategy:
 * 1. Classify each file by type (test, config, auth, api, ui, docs, deps, ci)
 * 2. Group files by their classification
 * 3. Label each cluster by dominant directory or purpose
 */

import { basename, dirname, extname } from 'path';
import type { PRFile, FileCluster, ClusterType } from '../types/index.js';

interface ClassifiedFile {
  file: PRFile;
  type: ClusterType;
  directory: string;
}

const TEST_PATTERNS = /\.(test|spec)\.[jt]sx?$|__tests__|\btest\b|\bspec\b/i;
const CONFIG_PATTERNS = /\.(yml|yaml|json|toml|ini|env|config\.[jt]s)$|^\.|\bconfig\b/i;
const AUTH_PATTERNS = /\b(auth|login|logout|session|token|jwt|oauth|permission|role|acl)\b/i;
const API_PATTERNS = /\b(api|routes?|endpoints?|handlers?|controllers?|services?|resolvers?|schema)\b/i;
const UI_PATTERNS = /\.(css|scss|sass|less|svg|png|jpg|gif|ico|woff|ttf)$|\bcomponents?\b|\b(view|page|style|theme)\b/i;
const DOCS_PATTERNS = /\.(md|mdx|rst|txt|adoc)$|\bdocs?\b|\bREADME\b/i;
const DEPS_PATTERNS = /^(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Gemfile|Cargo\.toml|go\.mod|requirements\.txt|composer\.json)$/i;
const CI_PATTERNS = /^\.github\/|\.gitlab-ci|Dockerfile|\.dockerignore|Makefile|jenkins/i;

export function classifyFile(file: PRFile): ClusterType {
  const name = basename(file.path);
  const fullPath = file.path;

  if (DEPS_PATTERNS.test(name)) return 'deps';
  if (CI_PATTERNS.test(fullPath)) return 'ci';
  if (DOCS_PATTERNS.test(name)) return 'docs';
  if (TEST_PATTERNS.test(fullPath)) return 'test';
  if (UI_PATTERNS.test(fullPath)) return 'ui';
  if (API_PATTERNS.test(fullPath)) return 'api';
  if (AUTH_PATTERNS.test(fullPath)) return 'auth';
  if (CONFIG_PATTERNS.test(name)) return 'config';
  return 'core';
}

function clusterLabel(type: ClusterType, files: PRFile[]): string {
  // Find the most common top-level directory
  const dirs = files.map((f) => dirname(f.path).split('/')[0]).filter((d) => d && d !== '.');
  const dirCount = new Map<string, number>();
  for (const d of dirs) dirCount.set(d, (dirCount.get(d) ?? 0) + 1);

  const topDir = [...dirCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const labels: Record<ClusterType, string> = {
    test: 'Test Updates',
    config: 'Configuration',
    auth: 'Auth & Permissions',
    api: 'API / Endpoints',
    ui: 'UI Components & Styles',
    docs: 'Documentation',
    deps: 'Dependency Changes',
    ci: 'CI / Infrastructure',
    core: topDir ? `Core (${topDir})` : 'Core Logic',
    other: 'Other Changes',
  };

  return labels[type];
}

export function groupFilesBySemantics(files: PRFile[]): FileCluster[] {
  // Classify each file
  const classified: ClassifiedFile[] = files.map((f) => ({
    file: f,
    type: classifyFile(f),
    directory: dirname(f.path),
  }));

  // Group by type
  const groups = new Map<ClusterType, PRFile[]>();
  for (const c of classified) {
    const existing = groups.get(c.type) ?? [];
    existing.push(c.file);
    groups.set(c.type, existing);
  }

  const clusters: FileCluster[] = [];
  for (const [type, clusterFiles] of groups) {
    const additions = clusterFiles.reduce((sum, f) => sum + f.additions, 0);
    const deletions = clusterFiles.reduce((sum, f) => sum + f.deletions, 0);
    clusters.push({
      label: clusterLabel(type, clusterFiles),
      files: clusterFiles.map((f) => f.path),
      additions,
      deletions,
      type,
    });
  }

  // Sort clusters by total change size desc
  return clusters.sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
}

/**
 * Generate a text summary from clusters.
 */
export function generateSummary(clusters: FileCluster[], prTitle: string): string {
  const parts: string[] = [];

  const core = clusters.filter((c) => c.type === 'core' || c.type === 'api' || c.type === 'auth');
  const tests = clusters.find((c) => c.type === 'test');
  const docs = clusters.find((c) => c.type === 'docs');
  const deps = clusters.find((c) => c.type === 'deps');
  const config = clusters.find((c) => c.type === 'config');

  if (core.length > 0) {
    parts.push(`Core changes in: ${core.map((c) => c.label).join(', ')}`);
  }
  if (tests) {
    parts.push(`Tests updated (${tests.files.length} file${tests.files.length > 1 ? 's' : ''})`);
  }
  if (docs) parts.push(`Documentation updated`);
  if (deps) parts.push(`Dependencies modified`);
  if (config) parts.push(`Configuration changed`);

  return parts.join('. ') || `Changes across ${clusters.length} area(s)`;
}

/**
 * Detect potentially breaking changes in the diff.
 */
export function detectBreakingChanges(files: PRFile[]): string[] {
  const warnings: string[] = [];

  for (const file of files) {
    if (!file.patch) continue;
    const patch = file.patch;

    // Deleted exports
    if (/^-.*export\s+(default|function|class|const|let|var)/m.test(patch)) {
      warnings.push(`Possible removed export in ${file.path}`);
    }
    // Changed function signatures
    if (/^-.*function\s+\w+\s*\([^)]+\)/m.test(patch) && /^\+.*function\s+\w+\s*\([^)]+\)/m.test(patch)) {
      warnings.push(`Function signature changed in ${file.path}`);
    }
    // Deleted API routes
    if (/^-.*\.(get|post|put|delete|patch)\s*\(/m.test(patch)) {
      warnings.push(`API route possibly removed in ${file.path}`);
    }
  }

  return warnings;
}
