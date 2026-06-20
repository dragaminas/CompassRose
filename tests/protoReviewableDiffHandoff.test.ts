import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { classifyImplementation, parseTaskDocument, selectReviewableDiffForReview } from '../proto/protoCompassRose.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('proto reviewable diff handoff', () => {
  test('infers single-path live-diff handoff requirements from the legacy task contract', () => {
    const taskPath = join(
      repoRoot,
      'docs',
      'features',
      '002-configuration-model',
      'tasks',
      'F002-T04-C2-U1-U1-C1-C1-resubmit-the-retry-restoration-target-task-with-a-single-path-diff-and-compliant-implementation-notes.md',
    );
    const task = parseTaskDocument(taskPath, readFileSync(taskPath, 'utf8'));

    expect(task.reviewableDiffHandoff.requireLiveDiff).toBe(true);
    expect(task.reviewableDiffHandoff.allowGitCommitBeforeHandoff).toBe(false);
    expect(task.reviewableDiffHandoff.requiredChangedFiles).toEqual([
      'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md',
    ]);
  });

  test('reconstructs state-correction metadata directly from the task markdown', () => {
    const taskPath = join(
      repoRoot,
      'docs',
      'features',
      '002-configuration-model',
      'tasks',
      '004.3-repair-feature-state-for-f002-t04.md',
    );
    const task = parseTaskDocument(taskPath, readFileSync(taskPath, 'utf8'));

    expect(task.stateCorrection).not.toBeNull();
    expect(task.stateCorrection?.state_target.restored_lifecycle_state).toBe('review_pending');
    expect(task.stateCorrection?.state_target.restored_active_task).toBe('F002-T04');
  });

  test('reconstructs unblock metadata directly from the task markdown', () => {
    const taskPath = join(
      repoRoot,
      'docs',
      'features',
      '002-configuration-model',
      'tasks',
      'F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md',
    );
    const task = parseTaskDocument(taskPath, readFileSync(taskPath, 'utf8'));

    expect(task.unblock).not.toBeNull();
    expect(task.unblock?.blocker.kind).toBe('implementation_failure');
    expect(task.unblock?.restoration_target.active_task).toBe('F002-T04-C2');
  });

  test('classifies committed-away diffs as reviewable_diff_lost before generic no-diff outcomes', () => {
    const classification = classifyImplementation(
      {
        ok: true,
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
        commandInvoked: 'opencode run ...',
      },
      '$ git commit -m "fix: preserve retry contract"\n[master 816320d] fix: preserve retry contract\n',
      false,
      'Kept the diff scoped correctly before committing.',
      'abc1234',
      'def5678',
      'diff --git a/task.md b/task.md\n',
    );

    expect(classification).toBe('reviewable_diff_lost');
  });

  test('falls back to the committed diff for review when the live worktree diff was lost', () => {
    const selection = selectReviewableDiffForReview('', {
      diagnostics: {
        classification: 'reviewable_diff_lost',
        evidence: [],
        first_executable_step_status: 'attempted',
        minimum_progress_evidence_status: 'absent',
        exit_code: 0,
        signal: null,
        timed_out: false,
        command_invoked: 'opencode run ...',
      },
      fallback_git_diff: 'diff --git a/task.md b/task.md\n',
    });

    expect(selection.source).toBe('fallback');
    expect(selection.diff).toContain('diff --git');
  });
});
