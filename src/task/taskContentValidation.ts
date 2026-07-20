// Content validation for scope/quality_gates -- not just shape. Both are typed as plain
// `string[]` (see src/contracts/planner/output.schema.json), so nothing stops an LLM from
// writing a value that parses fine but is semantically broken. Two real bugs motivate this,
// both found by hand in F002-T17-C1's own task document before being fixed elsewhere:
// - an allowed_paths entry with a prose annotation glued onto the path
//   (`src/task/taskId.ts (cleanup only: ...)`), which silently breaks the exact-prefix matching
//   in isPathAllowedByPrefix (see src/shared/pathPrefix.ts) -- fixed in 42e9e566.
// - a `git diff --exit-code` quality gate with no explicit ref, on a correction/recovery task
//   whose job is to undo something a prior task already committed -- comparing against HEAD is
//   meaningless there, since HEAD already contains what needs to be undone -- fixed in 75e7cc54.

const PARENTHETICAL_ANNOTATION_SUFFIX = /^(.+?)\s+\([^()]*\)$/;

export interface ScopePathSanitization {
  readonly allowedPaths: readonly string[];
  /** Human-readable notices for each entry that was auto-corrected; log these, don't discard them. */
  readonly notices: readonly string[];
}

/**
 * Strips a trailing parenthetical annotation from each allowed_paths entry (the one known,
 * mechanically-safe defect pattern), and rejects anything still not a plausible bare path
 * afterward -- there is no safe way to guess a fix for that, so it fails validation instead of
 * silently doing something else to it.
 */
export function sanitizeAllowedPaths(allowedPaths: readonly string[]): ScopePathSanitization {
  const notices: string[] = [];
  const sanitized = allowedPaths.map((raw) => {
    const match = raw.match(PARENTHETICAL_ANNOTATION_SUFFIX);
    if (!match) {
      return raw;
    }

    const stripped = (match[1] ?? '').trim();
    notices.push(`allowed_paths entry "${raw}" had a parenthetical annotation glued onto the path; stripped to "${stripped}".`);
    return stripped;
  });

  const stillInvalid = sanitized.filter((path) => !isPlausiblePathEntry(path));
  if (stillInvalid.length > 0) {
    throw new Error(
      `allowed_paths contains entries that are not plausible bare paths, even after stripping a known ` +
      `parenthetical-annotation pattern: ${stillInvalid.map((path) => `"${path}"`).join(', ')}. ` +
      `A real path never contains parentheses or embedded whitespace; move any explanatory text into ` +
      `the task's constraints instead of the scope list.`,
    );
  }

  return { allowedPaths: sanitized, notices };
}

function isPlausiblePathEntry(path: string): boolean {
  return path.length > 0 && !/[()]/.test(path) && !/\s/.test(path);
}

/**
 * `git diff ... --exit-code` commands whose only ref is an implicit comparison against the
 * current worktree/HEAD, with no explicit commit token before the `--` pathspec separator (see
 * `git diff [<options>] [<commit>] [--] [<path>...]`). Harmless for a task's own first-time
 * quality gates, but meaningless for a correction/recovery task whose job is to undo something a
 * prior task already committed: HEAD already contains that content, so a bare-HEAD diff can only
 * pass by leaving it untouched.
 */
export function findMissingRefGitDiffExitCodeGates(commands: readonly string[]): readonly string[] {
  return commands.filter((command) => {
    if (!/\bgit diff\b/.test(command) || !/--exit-code\b/.test(command)) {
      return false;
    }

    const beforePathspec = command.split(/\s--\s/)[0] ?? command;
    const afterDiff = beforePathspec.replace(/^.*?\bgit diff\b/, '').trim();
    const tokens = afterDiff.split(/\s+/).filter((token) => token.length > 0);
    const hasRefToken = tokens.some((token) => !token.startsWith('-'));
    return !hasRefToken;
  });
}

/**
 * Hard-blocks planning a correction/recovery task whose quality_gates include an unenforceable
 * `git diff --exit-code` gate (see findMissingRefGitDiffExitCodeGates) -- there's no safe way to
 * guess which ref it should have compared against, so unlike sanitizeAllowedPaths this always
 * throws rather than silently substituting something.
 */
export function validateQualityGateRefs(commands: readonly string[], taskLabel: string): void {
  const offending = findMissingRefGitDiffExitCodeGates(commands);
  if (offending.length === 0) {
    return;
  }

  throw new Error(
    `Planned ${taskLabel} quality_gates include a \`git diff ... --exit-code\` check with no explicit ref: ` +
    `${offending.map((command) => `"${command}"`).join(', ')}. A correction/recovery task's own quality ` +
    `gates must diff against the commit before the task being corrected began, not the current HEAD -- ` +
    `HEAD already contains whatever this task exists to undo, so a bare-HEAD diff could only ever pass ` +
    `by leaving it untouched. Add the explicit ref (the commit before the original task's implementation).`,
  );
}
