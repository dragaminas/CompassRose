import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { selectImplementationContextArtifactNames } from '../src/contracts/runtime/agentContext.js';
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
      '004.2-repair-feature-state-for-f002-t04.md',
    );
    const task = parseTaskDocument(taskPath, readFileSync(taskPath, 'utf8'));

    expect(task.stateCorrection).not.toBeNull();
    expect(task.stateCorrection?.state_target.restored_lifecycle_state).toBe('quality_failed');
    expect(task.stateCorrection?.state_target.restored_active_task).toBe('F002-T04');
  });

  test('reconstructs task lineage metadata directly from the task markdown', () => {
    const taskPath = join(repoRoot, 'tmp', 'versioned-task.md');
    const markdown = [
      '# Task 9: Revise the planner output contract',
      '',
      '## Task ID',
      '',
      '`F002-T04-C9`',
      '',
      '## Task Lineage',
      '',
      '- previous_task_id: `F002-T04-C8`',
      '',
      '## Parent Feature',
      '',
      '`002-configuration-model`',
      '',
      '## Goal',
      '',
      'Revise the planner output contract without changing feature scope.',
      '',
      '## First Executable Step',
      '',
      'Open the contract and add the lineage field.',
      '',
      '## Minimum Progress Evidence',
      '',
      '- `src/contracts/planner/output.md` changes on disk.',
      '',
      '## Scope',
      '',
      'Allowed:',
      '- `src/contracts/planner/output.md`',
      '',
      'Forbidden:',
      '- `docs/features/`',
      '',
      '## Constraints',
      '',
      '- Keep the change minimal.',
      '',
      '## Development Policy',
      '',
      '- `documentation_first`',
      '',
      '## Acceptance Criteria',
      '',
      '- The contract can express task lineage.',
      '',
      '## Quality Gates to Run',
      '',
      '```bash',
      'git diff --check',
      '```',
      '',
      '## Expected Deliverables',
      '',
      '- `documentation`',
      '',
    ].join('\n');
    const task = parseTaskDocument(taskPath, markdown);

    expect(task.previousTaskId).toBe('F002-T04-C8');
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

  test('classifies no-diff attempts as already_complete when implementation notes prove the behavior already existed', () => {
    const notes = [
      '## Implementation Notes',
      '',
      '- status: already_complete',
      '- reason: the requested behavior already exists in src/config/configReader.ts',
      '- evidence: src/config/configReader.ts, tests/configReader.test.ts',
    ].join('\n');

    const classification = classifyImplementation(
      {
        ok: true,
        stdout: notes,
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
        commandInvoked: 'opencode run ...',
      },
      notes,
      false,
      notes,
      'abc1234',
      'abc1234',
      null,
    );

    expect(classification).toBe('already_complete');
  });

  test('classifies already_complete even when the agent bolds only the "Status" label with the colon outside the emphasis', () => {
    const notes = [
      '## Implementation Notes',
      '',
      '**Status**: already_complete',
      '',
      'The requested behavior already exists in src/config/configReader.ts.',
    ].join('\n');

    const classification = classifyImplementation(
      {
        ok: true,
        stdout: notes,
        stderr: '',
        exitCode: 0,
        signal: null,
        timedOut: false,
        commandInvoked: 'opencode run ...',
      },
      notes,
      false,
      notes,
      'abc1234',
      'abc1234',
      null,
    );

    expect(classification).toBe('already_complete');
  });

  test('selects implementer context artifacts for the task from the agent-context log file names', () => {
    // These fixture names mirror recordAgentInvocationContext()'s actual output: it slugifies
    // `context.kind` (e.g. "subtask_execution") with slugify(), which turns every non-alphanumeric
    // character - including underscores - into a hyphen, so real file names are fully hyphenated.
    const names = selectImplementationContextArtifactNames([
      '001-feature-planning-planner-feature-plan-002-configuration-model.json',
      '002-subtask-execution-implementer-subtask-f002-t04-attempt-1.json',
      '002-subtask-execution-implementer-subtask-f002-t04-attempt-1.prompt.txt',
      '003-subtask-review-reviewer-subtask-f002-t04.json',
      '004-doctor-recovery-task-doctor-subtask-f002-t04.json',
    ], 'F002-T04');

    expect(names).toEqual([
      '002-subtask-execution-implementer-subtask-f002-t04-attempt-1.json',
      '002-subtask-execution-implementer-subtask-f002-t04-attempt-1.prompt.txt',
    ]);
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
