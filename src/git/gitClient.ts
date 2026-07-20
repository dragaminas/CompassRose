import { spawnSync } from 'node:child_process';
import { uniqueStrings } from '../shared/arrays.js';
import { isPathAllowedByPrefix } from '../shared/pathPrefix.js';
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

export class GitClient {
  constructor(private readonly repositoryRoot: string) {}

  ensureCleanWorktree(allowedDirtyPrefixes: readonly string[] = []): void {
    const disallowedPaths = this.findDisallowedDirtyPaths(allowedDirtyPrefixes);
    if (disallowedPaths.length > 0) {
      throw new Error(
        `Prototype run requires a clean worktree before mutating steps. Disallowed dirty paths: ${disallowedPaths.join(', ')}.`,
      );
    }
  }

  findDisallowedDirtyPaths(allowedDirtyPrefixes: readonly string[] = []): string[] {
    return this.dirtyPaths().filter((path) => !isPathAllowedByPrefix(path, allowedDirtyPrefixes));
  }

  dirtyPaths(): string[] {
    return parseGitStatusPaths(this.execGit(['status', '--porcelain']));
  }

  /**
   * Discards working-tree and index changes for `paths` back to `HEAD`, deleting any of them
   * that turn out to be untracked entirely (`checkout HEAD --` no-ops/fails harmlessly on a path
   * HEAD never had, so `clean -f -d` is what actually removes it). Used to reconcile the
   * worktree when a new active task's scope supersedes a previous, now-abandoned attempt whose
   * own dirty diff falls outside that new scope.
   */
  discardDirtyPaths(paths: readonly string[]): void {
    for (const path of paths) {
      this.execGitAllowStatus(['checkout', 'HEAD', '--', path], [0, 1]);
      this.execGitAllowStatus(['clean', '-f', '-d', '--', path], [0, 1]);
    }
  }

  /**
   * Runs `fn` against a clean checkout of `HEAD` by temporarily stashing every current change
   * (tracked and untracked), then restoring the stash afterward -- even if `fn` throws. Used to
   * confirm whether a quality-gate failure already existed before the active task's own diff, so
   * a pre-existing/unrelated failure is never mistaken for a defect this task introduced. Returns
   * `null` (and leaves the worktree untouched) when there is nothing to stash, since a clean
   * baseline and the current tree are then identical anyway.
   */
  runAgainstCleanBaseline<T>(fn: () => T): T | null {
    if (this.dirtyPaths().length === 0) {
      return null;
    }

    this.execGitAllowStatus(['stash', 'push', '-u', '-m', 'compassrose-baseline-check'], [0]);
    try {
      return fn();
    } finally {
      this.execGitAllowStatus(['stash', 'pop'], [0]);
    }
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
