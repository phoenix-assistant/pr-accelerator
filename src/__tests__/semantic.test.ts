import { describe, it, expect } from 'vitest';
import { classifyFile, groupFilesBySemantics, generateSummary, detectBreakingChanges } from '../algorithms/semantic.js';
import type { PRFile } from '../types/index.js';

function mockFile(path: string, additions = 10, deletions = 5, status: PRFile['status'] = 'modified', patch?: string): PRFile {
  return { path, additions, deletions, status, patch };
}

describe('classifyFile', () => {
  it('classifies test files', () => {
    expect(classifyFile(mockFile('src/auth.test.ts'))).toBe('test');
    expect(classifyFile(mockFile('src/__tests__/foo.ts'))).toBe('test');
    expect(classifyFile(mockFile('test/utils.spec.js'))).toBe('test');
  });

  it('classifies config files', () => {
    expect(classifyFile(mockFile('.env'))).toBe('config');
    expect(classifyFile(mockFile('tsconfig.json'))).toBe('config');
    expect(classifyFile(mockFile('webpack.config.js'))).toBe('config');
  });

  it('classifies auth files', () => {
    expect(classifyFile(mockFile('src/auth/login.ts'))).toBe('auth');
    expect(classifyFile(mockFile('middleware/jwt.ts'))).toBe('auth');
  });

  it('classifies API files', () => {
    expect(classifyFile(mockFile('src/api/users.ts'))).toBe('api');
    expect(classifyFile(mockFile('routes/orders.ts'))).toBe('api');
    expect(classifyFile(mockFile('controllers/product.ts'))).toBe('api');
  });

  it('classifies UI files', () => {
    expect(classifyFile(mockFile('src/components/Header.tsx'))).toBe('ui');
    expect(classifyFile(mockFile('styles/main.css'))).toBe('ui');
  });

  it('classifies docs files', () => {
    expect(classifyFile(mockFile('README.md'))).toBe('docs');
    expect(classifyFile(mockFile('docs/setup.md'))).toBe('docs');
  });

  it('classifies dependency files', () => {
    expect(classifyFile(mockFile('package.json'))).toBe('deps');
    expect(classifyFile(mockFile('yarn.lock'))).toBe('deps');
  });

  it('classifies CI files', () => {
    expect(classifyFile(mockFile('.github/workflows/ci.yml'))).toBe('ci');
    expect(classifyFile(mockFile('Dockerfile'))).toBe('ci');
  });

  it('classifies core files as default', () => {
    expect(classifyFile(mockFile('src/utils/helpers.ts'))).toBe('core');
    expect(classifyFile(mockFile('lib/index.ts'))).toBe('core');
  });
});

describe('groupFilesBySemantics', () => {
  it('groups files into clusters', () => {
    const files = [
      mockFile('src/auth/login.ts'),
      mockFile('src/auth/token.ts'),
      mockFile('src/auth/login.test.ts'),
      mockFile('src/api/users.ts'),
      mockFile('README.md'),
      mockFile('package.json'),
    ];
    const clusters = groupFilesBySemantics(files);
    expect(clusters.length).toBeGreaterThan(0);
    const types = clusters.map((c) => c.type);
    expect(types).toContain('auth');
    expect(types).toContain('test');
    expect(types).toContain('docs');
    expect(types).toContain('deps');
  });

  it('returns empty for no files', () => {
    expect(groupFilesBySemantics([])).toHaveLength(0);
  });

  it('calculates correct addition/deletion totals per cluster', () => {
    const files = [
      mockFile('src/auth/login.ts', 20, 10),
      mockFile('src/auth/token.ts', 30, 5),
    ];
    const clusters = groupFilesBySemantics(files);
    const auth = clusters.find((c) => c.type === 'auth');
    expect(auth).toBeDefined();
    expect(auth!.additions).toBe(50);
    expect(auth!.deletions).toBe(15);
  });
});

describe('detectBreakingChanges', () => {
  it('detects deleted exports', () => {
    const files = [
      mockFile('src/utils.ts', 0, 5, 'modified', '-export function helper() {}\n+// removed'),
    ];
    const warnings = detectBreakingChanges(files);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('src/utils.ts');
  });

  it('returns empty for no patches', () => {
    const files = [mockFile('src/utils.ts')];
    expect(detectBreakingChanges(files)).toHaveLength(0);
  });

  it('detects changed function signatures', () => {
    const patch = '-function doSomething(a: string) {}\n+function doSomething(a: string, b: number) {}';
    const files = [mockFile('src/core.ts', 1, 1, 'modified', patch)];
    const warnings = detectBreakingChanges(files);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
