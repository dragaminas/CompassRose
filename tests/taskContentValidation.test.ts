import { describe, expect, test } from 'vitest';
import {
  findMissingRefGitDiffExitCodeGates,
  sanitizeAllowedPaths,
  validateQualityGateRefs,
} from '../src/task/taskContentValidation.js';

describe('sanitizeAllowedPaths', () => {
  test('leaves clean paths untouched with no notices', () => {
    const result = sanitizeAllowedPaths(['src/allowed.ts', 'docs/features/foo/state.md']);
    expect(result.allowedPaths).toEqual(['src/allowed.ts', 'docs/features/foo/state.md']);
    expect(result.notices).toHaveLength(0);
  });

  test('strips a parenthetical annotation glued onto a path (the F002-T17-C1 bug) and reports a notice', () => {
    const result = sanitizeAllowedPaths(['src/task/taskId.ts (cleanup only: remove the stray helper)']);
    expect(result.allowedPaths).toEqual(['src/task/taskId.ts']);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toContain('src/task/taskId.ts');
  });

  test('sanitizes only the offending entry, leaving the rest of the list untouched', () => {
    const result = sanitizeAllowedPaths(['src/allowed.ts', 'src/bad.ts (annotation)']);
    expect(result.allowedPaths).toEqual(['src/allowed.ts', 'src/bad.ts']);
    expect(result.notices).toHaveLength(1);
  });

  test('throws on an entry that is not a plausible path even after the known sanitization pattern', () => {
    expect(() => sanitizeAllowedPaths(['this is just prose, not a path'])).toThrow(/not plausible bare paths/);
  });

  test('throws on an entry with unbalanced/multiple parentheses that the known pattern cannot cleanly strip', () => {
    expect(() => sanitizeAllowedPaths(['src/allowed.ts (note (nested) annotation)'])).toThrow(/not plausible bare paths/);
  });
});

describe('findMissingRefGitDiffExitCodeGates', () => {
  test('flags a git diff --exit-code gate with no explicit ref (the F002-T17-C1 bug)', () => {
    const offending = findMissingRefGitDiffExitCodeGates([
      'git diff --name-only --exit-code -- docs/features/foo/tasks/bar.md',
    ]);
    expect(offending).toHaveLength(1);
  });

  test('does not flag the same gate once it has an explicit ref', () => {
    const offending = findMissingRefGitDiffExitCodeGates([
      'git diff --name-only --exit-code 023507f3 -- docs/features/foo/tasks/bar.md',
    ]);
    expect(offending).toHaveLength(0);
  });

  test('does not flag unrelated gates', () => {
    const offending = findMissingRefGitDiffExitCodeGates(['npm test', 'npm run typecheck', 'git diff --check']);
    expect(offending).toHaveLength(0);
  });

  test('flags a bare git diff --exit-code with no pathspec and no ref', () => {
    const offending = findMissingRefGitDiffExitCodeGates(['git diff --exit-code']);
    expect(offending).toHaveLength(1);
  });
});

describe('validateQualityGateRefs', () => {
  test('throws a clear error identifying the offending command when validation fails', () => {
    expect(() =>
      validateQualityGateRefs(['git diff --name-only --exit-code -- src/foo.ts'], 'correction task'),
    ).toThrow(/correction task/);
  });

  test('does not throw when every gate is either unrelated or already has a ref', () => {
    expect(() =>
      validateQualityGateRefs(
        ['npm test', 'git diff --name-only --exit-code abc1234 -- src/foo.ts'],
        'correction task',
      ),
    ).not.toThrow();
  });
});
