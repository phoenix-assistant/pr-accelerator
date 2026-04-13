import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import type { Config } from '../types/index.js';

const DEFAULTS: Config = {
  minReviewers: 2,
  autoAssign: false,
  ignorePaths: ['*.lock', 'dist/**', 'node_modules/**'],
  expertiseDecayDays: 90,
  maxReviewersToSuggest: 3,
  loadBalancing: true,
};

export function loadConfig(cwd?: string): Config {
  const dir = cwd ?? process.cwd();
  const configPath = join(dir, '.pr-accelerator.yml');
  if (!existsSync(configPath)) return { ...DEFAULTS };
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = yaml.load(raw) as Partial<Config>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function generateConfigYaml(): string {
  return `# pr-accelerator configuration
# https://github.com/phoenix-assistant/pr-accelerator

# Minimum number of reviewers required before merging
minReviewers: 2

# Automatically assign reviewers when CI runs pr-accelerator ci auto-assign
autoAssign: false

# Paths to ignore when computing expertise scores
ignorePaths:
  - "*.lock"
  - "dist/**"
  - "node_modules/**"
  - ".github/**"

# Expertise decay: contributions older than this many days are weighted less
# Default: 90 days (exponential half-life)
expertiseDecayDays: 90

# Maximum number of reviewer suggestions to show
maxReviewersToSuggest: 3

# Use load balancing (M/M/c model) when suggesting reviewers
loadBalancing: true
`;
}
