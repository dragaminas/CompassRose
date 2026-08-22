import { describe, expect, test } from 'vitest';
import { buildImplementerPrompt } from '../src/orchestrator/promptBuilding.js';
import type { ParsedTaskDocument } from '../src/contracts/task/taskContracts.js';

function buildParsedTask(overrides: Partial<ParsedTaskDocument> = {}): ParsedTaskDocument {
  return {
    taskId: 'F001-T01',
    previousTaskId: null,
    featureId: '001-widgets',
    title: 'Add widget support',
    objective: 'Support widgets end to end.',
    firstExecutableStep: 'Add a failing test for widget rendering.',
    minimumProgressEvidence: ['a test exists'],
    allowedPaths: ['src/widgets.ts'],
    forbiddenPaths: ['docs/'],
    constraints: [],
    acceptanceCriteria: [],
    qualityGates: ['npm test'],
    developmentPolicy: 'test_guided',
    likelyAffectedFiles: ['src/widgets.ts', 'tests/widgets.test.ts'],
    trace: { roadmap_objective: 'x', feature_goal: 'y', state_gap: 'z' },
    context: { summary: 'x', relevant_paths: [], relevant_modules: [] },
    expectedDeliverables: ['code', 'tests'],
    stateCorrection: null,
    doctorRecovery: null,
    unblock: null,
    reviewableDiffHandoff: { requireLiveDiff: true, allowGitCommitBeforeHandoff: false, requiredChangedFiles: [] },
    path: 'compassrose/features/001-widgets/tasks/001-add-widget-support.md',
    ...overrides,
  };
}

describe('buildImplementerPrompt', () => {
  test('describes a normal subtask and requires the live diff to stay visible', () => {
    const prompt = buildImplementerPrompt(buildParsedTask(), false, null);
    expect(prompt).toContain('Execute subtask `F001-T01` for feature `001-widgets`.');
    expect(prompt).toContain('Start with: Add a failing test for widget rendering.');
    expect(prompt).toContain('Leave the live worktree diff visible for handoff');
    expect(prompt).not.toContain('state repair task');
  });

  test('lists specific required changed files when the handoff names them', () => {
    const task = buildParsedTask({
      reviewableDiffHandoff: {
        requireLiveDiff: true,
        allowGitCommitBeforeHandoff: false,
        requiredChangedFiles: ['src/widgets.ts'],
      },
    });
    const prompt = buildImplementerPrompt(task, false, null);
    expect(prompt).toContain('leave the live worktree diff visible and limited to: `src/widgets.ts`');
  });

  test('describes a state-repair task differently and reads the state-correction contract', () => {
    const stateCorrection = {
      task_id: 'F001-T01-C1',
      feature_id: '001-widgets',
      title: 'Repair state',
      objective: 'Repair it',
      first_executable_step: 'Fix state.md',
      minimum_progress_evidence: [],
      trace: { roadmap_objective: 'x', feature_goal: 'y', state_gap: 'z' },
      state_target: {
        feature_state_path: 'compassrose/features/001-widgets/state.md',
        project_state_path: null,
        contract_reference: '',
        detected_issue: '',
        restored_lifecycle_state: 'task_ready',
        restored_active_task: 'F001-T01',
        restored_active_correction_task: 'none',
      },
      context: { summary: '', relevant_paths: [], relevant_modules: [] },
      scope: { allowed_paths: [], forbidden_paths: [] },
      constraints: [],
      development_policy: { mode: 'documentation_first' as const },
      quality_gates: { before_review: [] },
      acceptance_criteria: [],
      expected_deliverables: ['documentation' as const],
    };

    const prompt = buildImplementerPrompt(buildParsedTask(), false, stateCorrection);
    expect(prompt).toContain('Execute state repair task');
    expect(prompt).toContain('src/contracts/task/state-correction-task.md');
    expect(prompt).toContain('keep the change documentation-only');
  });

  test('includes supplied recovery-lesson lines', () => {
    const prompt = buildImplementerPrompt(buildParsedTask(), false, null, ['- Avoid the same mistake as last time.']);
    expect(prompt).toContain('- Avoid the same mistake as last time.');
  });
});
