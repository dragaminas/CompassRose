import { describe, expect, test } from 'vitest';
import { inferReviewableDiffHandoff, parseTaskDocument, storedTaskArtifactFromDocument } from '../src/task/taskDocument.js';

function buildTaskMarkdown(overrides: Partial<Record<string, string>> = {}): string {
  const sections: Record<string, string> = {
    title: '# Task F1-T1: Add the widget',
    taskId: '## Task ID\n\n`F1-T1`',
    parentFeature: '## Parent Feature\n\n`001-widgets`',
    goal: '## Goal\n\nAdd the widget.',
    firstStep: '## First Executable Step\n\nAdd a failing test for the widget.',
    minimumProgressEvidence: '## Minimum Progress Evidence\n\n- tests/widget.test.ts contains a new test.',
    scope: '## Scope\n\nAllowed:\n- src/widget.ts\n- tests/widget.test.ts\n\nForbidden:\n- docs/',
    constraints: '## Constraints\n\n- Keep the change minimal.',
    acceptanceCriteria: '## Acceptance Criteria\n\n- The widget renders.',
    qualityGates: '## Quality Gates to Run\n\n```bash\nnpm test\n```',
    developmentPolicy: '## Development Policy\n\n- `test_guided`',
    expectedDeliverables: '## Expected Deliverables\n\n- code\n- tests',
    ...overrides,
  };

  return Object.values(sections).join('\n\n') + '\n';
}

describe('parseTaskDocument', () => {
  test('parses the core fields of a regular task document', () => {
    const markdown = buildTaskMarkdown();
    const task = parseTaskDocument('/tasks/F1-T1.md', markdown);

    expect(task.taskId).toBe('F1-T1');
    expect(task.featureId).toBe('001-widgets');
    expect(task.title).toBe('Add the widget');
    expect(task.objective).toBe('Add the widget.');
    expect(task.firstExecutableStep).toBe('Add a failing test for the widget.');
    expect(task.allowedPaths).toEqual(['src/widget.ts', 'tests/widget.test.ts']);
    expect(task.forbiddenPaths).toEqual(['docs/']);
    expect(task.qualityGates).toEqual(['npm test']);
    expect(task.developmentPolicy).toBe('test_guided');
    expect(task.expectedDeliverables).toEqual(['code', 'tests']);
    expect(task.previousTaskId).toBeNull();
    expect(task.stateCorrection).toBeNull();
    expect(task.path).toBe('/tasks/F1-T1.md');
  });

  test('reads previous_task_id from an explicit Task Lineage section', () => {
    const markdown = buildTaskMarkdown({
      lineage: '## Task Lineage\n\n- previous_task_id: `F1-T1-C1`',
    });

    expect(parseTaskDocument('/tasks/F1-T1.md', markdown).previousTaskId).toBe('F1-T1-C1');
  });

  test('falls back to code/tests deliverables when no Expected Deliverables section is present and paths are not docs-only', () => {
    const markdown = buildTaskMarkdown({ expectedDeliverables: '' });
    expect(parseTaskDocument('/tasks/F1-T1.md', markdown).expectedDeliverables).toEqual(['code', 'tests']);
  });

  test('falls back to documentation-only deliverables when every allowed path is under docs/', () => {
    const markdown = buildTaskMarkdown({
      scope: '## Scope\n\nAllowed:\n- compassrose/features/001-widgets/feature.md\n\nForbidden:\n- src/',
      expectedDeliverables: '',
    });
    expect(parseTaskDocument('/tasks/F1-T1.md', markdown).expectedDeliverables).toEqual(['documentation']);
  });

  test('parses a state-correction task when a State Target section is present', () => {
    const markdown = buildTaskMarkdown({
      stateTarget: [
        '## State Target',
        '',
        '- feature_state_path: `compassrose/features/001-widgets/state.md`',
        '- restored_lifecycle_state: task_ready',
        '- restored_active_task: `F1-T1`',
      ].join('\n'),
    });

    const task = parseTaskDocument('/tasks/F1-T1-C1.md', markdown);
    expect(task.stateCorrection).not.toBeNull();
    expect(task.stateCorrection?.state_target.restored_lifecycle_state).toBe('task_ready');
    expect(task.stateCorrection?.state_target.restored_active_task).toBe('F1-T1');
  });

});

describe('storedTaskArtifactFromDocument', () => {
  test('reshapes a parsed task document into the stored-artifact JSON shape', () => {
    const markdown = buildTaskMarkdown();
    const artifact = storedTaskArtifactFromDocument('/tasks/F1-T1.md', markdown);

    expect(artifact.task.task_id).toBe('F1-T1');
    expect(artifact.task.scope.allowed_paths).toEqual(['src/widget.ts', 'tests/widget.test.ts']);
    expect(artifact.task.quality_gates.before_review).toEqual(['npm test']);
    expect(artifact.state_correction).toBeUndefined();
    expect(artifact.doctor_recovery).toBeUndefined();
  });
});

describe('inferReviewableDiffHandoff', () => {
  test('defaults to requiring a live diff with no required changed files', () => {
    const handoff = inferReviewableDiffHandoff('', [], [], []);
    expect(handoff.requireLiveDiff).toBe(true);
    expect(handoff.allowGitCommitBeforeHandoff).toBe(false);
    expect(handoff.requiredChangedFiles).toEqual([]);
  });

  test('reads an explicit Reviewable Diff Handoff section', () => {
    const markdown = [
      '## Reviewable Diff Handoff',
      '',
      '- require_live_diff: false',
      '- allow_git_commit_before_handoff: true',
      '- required_changed_files: src/widget.ts, tests/widget.test.ts',
    ].join('\n');

    const handoff = inferReviewableDiffHandoff(markdown, [], [], []);
    expect(handoff.requireLiveDiff).toBe(false);
    expect(handoff.allowGitCommitBeforeHandoff).toBe(true);
    expect(handoff.requiredChangedFiles).toEqual(['src/widget.ts', 'tests/widget.test.ts']);
  });

  test('infers a required changed file from legacy "exactly one changed file" constraint text', () => {
    const handoff = inferReviewableDiffHandoff('', ['Preserve exactly one changed file: `src/widget.ts`.'], [], []);
    expect(handoff.requiredChangedFiles).toEqual(['src/widget.ts']);
  });
});
