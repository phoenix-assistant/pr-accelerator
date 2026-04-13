import { execSync, spawnSync } from 'child_process';

export function runCommand(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }).trim();
  } catch (err: unknown) {
    const error = err as { message?: string; stderr?: string | Buffer };
    const msg = error.stderr
      ? Buffer.isBuffer(error.stderr)
        ? error.stderr.toString()
        : error.stderr
      : error.message ?? String(err);
    throw new Error(`Command failed: ${cmd}\n${msg}`);
  }
}

export function runCommandSafe(cmd: string, cwd?: string): string | null {
  try {
    return runCommand(cmd, cwd);
  } catch {
    return null;
  }
}

export function isGhAvailable(): boolean {
  const result = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

export function isGitRepo(cwd?: string): boolean {
  const result = runCommandSafe('git rev-parse --is-inside-work-tree', cwd);
  return result?.trim() === 'true';
}

export function getRepoSlug(cwd?: string): string | null {
  const remote = runCommandSafe('git remote get-url origin', cwd);
  if (!remote) return null;
  const match = remote.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match ? match[1] : null;
}
