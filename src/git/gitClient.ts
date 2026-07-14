import { spawnSync } from 'node:child_process';
import { uniqueStrings } from '../shared/arrays.js';
import { ControlledStopError, stopExitCodeForSignal } from '../runtime/controlledStop.js';

function parseGitPathList(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseGitStatusPaths(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith('?? ')) {
        return line.slice(3).trim();
      }

      const pathSpec = line.slice(3).trim();
      const renameSeparator = pathSpec.indexOf(' -> ');
      return renameSeparator === -1 ? pathSpec : pathSpec.slice(renameSeparator + 4).trim();
    })
    .filter((path) => path.length > 0);
}

function isPathAllowedByPrefix(path: string, allowedPrefixes: readonly string[]): boolean {
  return allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export class GitClient {
  constructor(private readonly repositoryRoot: string) {}

  ensureCleanWorktree(allowedDirtyPrefixes: readonly string[] = []): void {
    const dirtyPaths = this.dirtyPaths();
    const disallowedPaths = dirtyPaths.filter((path) => !isPathAllowedByPrefix(path, allowedDirtyPrefixes));
    if (disallowedPaths.length > 0) {
      throw new Error(
        `Prototype run requires a clean worktree before mutating steps. Disallowed dirty paths: ${disallowedPaths.join(', ')}.`,
      );
    }
  }

  dirtyPaths(): string[] {
    return parseGitStatusPaths(this.execGit(['status', '--porcelain']));
  }

  diffNameOnly(excludedPaths: readonly string[] = []): string[] {
    const pathspecArgs = this.buildPathspecArgs(excludedPaths);
    return uniqueStrings([
      ...parseGitPathList(this.execGit(['diff', '--name-only', ...pathspecArgs])),
      ...parseGitPathList(this.execGit(['diff', '--cached', '--name-only', ...pathspecArgs])),
      ...parseGitPathList(this.execGit(['ls-files', '--others', '--exclude-standard', ...pathspecArgs])),
    ]);
  }

  diffPatch(excludedPaths: readonly string[] = []): string {
    const pathspecArgs = this.buildPathspecArgs(excludedPaths);
    const patches = [
      this.execGit(['diff', '--patch', '--no-ext-diff', ...pathspecArgs]).trim(),
      this.execGit(['diff', '--cached', '--patch', '--no-ext-diff', ...pathspecArgs]).trim(),
      ...parseGitPathList(this.execGit(['ls-files', '--others', '--exclude-standard', ...pathspecArgs])).map((path) =>
        this.execGitAllowStatus(['diff', '--no-index', '--', '/dev/null', path], [0, 1]).trim(),
      ),
    ].filter((patch) => patch.length > 0);

    return patches.join('\n');
  }

  diffNameOnlyBetween(fromRef: string, toRef: string, excludedPaths: readonly string[] = []): string[] {
    const pathspecArgs = this.buildPathspecArgs(excludedPaths);
    return parseGitPathList(this.execGit(['diff', '--name-only', fromRef, toRef, '--', ...pathspecArgs]));
  }

  diffPatchBetween(fromRef: string, toRef: string, excludedPaths: readonly string[] = []): string {
    const pathspecArgs = this.buildPathspecArgs(excludedPaths);
    return this.execGit(['diff', '--patch', '--no-ext-diff', fromRef, toRef, '--', ...pathspecArgs]).trim();
  }

  headCommit(): string {
    return this.execGit(['rev-parse', 'HEAD']).trim();
  }

  private buildPathspecArgs(excludedPaths: readonly string[]): string[] {
    if (excludedPaths.length === 0) {
      return [];
    }

    return ['.', ...excludedPaths.map((path) => `:(exclude)${path}`)];
  }

  commit(paths: readonly string[], message: string): void {
    if (paths.length === 0) {
      throw new Error('Refusing to commit with no paths.');
    }

    this.execGit(['add', '--', ...paths]);
    const staged = this.execGit(['diff', '--cached', '--name-only']);
    if (staged.trim().length === 0) {
      throw new Error('No staged changes found for commit.');
    }

    this.execGit(['commit', '-m', message]);
  }

  private execGit(args: string[]): string {
    return this.execGitAllowStatus(args, [0]);
  }

  private execGitAllowStatus(args: string[], allowedStatuses: readonly number[]): string {
    const result = spawnSync('git', args, {
      cwd: this.repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
      throw new ControlledStopError(
        `Controlled stop requested while running git ${args.join(' ')}.`,
        stopExitCodeForSignal(result.signal),
        result.signal,
      );
    }

    const status = result.status ?? -1;
    if (!allowedStatuses.includes(status)) {
      throw new Error(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
    }

    return result.stdout;
  }
}
