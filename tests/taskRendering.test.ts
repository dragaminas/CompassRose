import { describe, expect, test } from 'vitest';
import {
  bulletList,
  correctionTaskToTask,
  renderCorrectionTaskMarkdown,
  renderDoctorRecoveryTaskMarkdown,
  renderImplementationOutlineMarkdown,
  renderOutlineProgressMarkdown,
  renderStateCorrectionTaskMarkdown,
  renderTaskMarkdown,
  renderUnblockTaskMarkdown,
  stateCorrectionTaskToTask,
} from '../src/orchestrator/taskRendering.js';
import type { PlannedTask, TaskRequest } from '../src/contracts/planner/plannerContracts.js';
import type { CorrectionTask, DoctorRecoveryTaskMetadata, StateCorrectionTask } from '../src/contracts/task/taskContracts.js';

function buildTaskRequest(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: '1',
    title: 'Add the config loader',
    objective: 'Load and validate configuration from CONFIG.md.',
    scope: { allowed_paths: ['src/config/', 'tests/'], forbidden_paths: [] },
    status: 'not_started',
    sibling_check: { considered_features: [], belongs_to_other_feature: null },
    ...overrides,
  };
}

function buildTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    task_id: 'F001-T01',
    feature_id: '001-widgets',
    title: 'Add widget support',
    objective: 'Support widgets end to end.',
    first_executable_step: 'Add a failing test.',
    minimum_progress_evidence: ['a test exists'],
    trace: { roadmap_objective: 'x', feature_goal: 'y', state_gap: 'z' },
    context: { summary: 'summary', relevant_paths: ['src/widgets.ts'], relevant_modules: ['widgets'] },
    scope: { allowed_paths: ['src/widgets.ts'], forbidden_paths: ['docs/'] },
    constraints: ['keep it small'],
    development_policy: { mode: 'test_guided' },
    quality_gates: { before_review: ['npm test'] },
    acceptance_criteria: ['widgets work'],
    expected_deliverables: ['code', 'tests'],
    ...overrides,
  };
}

describe('bulletList', () => {
  test('formats each item as a markdown bullet', () => {
    expect(bulletList(['a', 'b'])).toBe('- a\n- b');
  });
});

describe('renderImplementationOutlineMarkdown', () => {
  test('renders each task request as a sub-heading with its objective and scope', () => {
    const markdown = renderImplementationOutlineMarkdown([
      buildTaskRequest(),
      buildTaskRequest({ id: '2', title: 'Wire the loader into the orchestrator', scope: { allowed_paths: ['src/orchestrator/'], forbidden_paths: ['docs/'] } }),
    ]);

    expect(markdown).toContain('### 1. Add the config loader');
    expect(markdown).toContain('Load and validate configuration from CONFIG.md.');
    expect(markdown).toContain('- `src/config/`');
    expect(markdown).toContain('- `tests/`');
    expect(markdown).toContain('### 2. Wire the loader into the orchestrator');
    expect(markdown).toContain('- `docs/`');
  });

  test('renders an empty outline when there are no task requests', () => {
    const markdown = renderImplementationOutlineMarkdown([]);
    expect(markdown).not.toContain('###');
  });
});

describe('renderOutlineProgressMarkdown', () => {
  test('renders one status bullet per task request', () => {
    const markdown = renderOutlineProgressMarkdown([
      buildTaskRequest({ status: 'complete' }),
      buildTaskRequest({ id: '2', title: 'Wire it up', status: 'in_progress' }),
      buildTaskRequest({ id: '3', title: 'Docs', status: 'superseded' }),
    ]);

    expect(markdown).toBe(
      [
        '- 1. Add the config loader: complete',
        '- 2. Wire it up: in progress',
        '- 3. Docs: superseded',
      ].join('\n'),
    );
  });
});

describe('renderTaskMarkdown', () => {
  test('includes the core task sections', () => {
    const markdown = renderTaskMarkdown(buildTask());
    expect(markdown).toContain('# Task 001: Add widget support');
    expect(markdown).toContain('## Task ID');
    expect(markdown).toContain('`F001-T01`');
    expect(markdown).toContain('## First Executable Step');
    expect(markdown).toContain('Add a failing test.');
    expect(markdown).toContain('Allowed:');
    expect(markdown).toContain('- `src/widgets.ts`');
    expect(markdown).not.toContain('## Task Lineage');
  });

  test('adds a Task Lineage section when previous_task_id is set', () => {
    const markdown = renderTaskMarkdown(buildTask({ previous_task_id: 'F001-T00' }));
    expect(markdown).toContain('## Task Lineage');
    expect(markdown).toContain('- previous_task_id: `F001-T00`');
  });
});

describe('renderCorrectionTaskMarkdown', () => {
  test('renders the correction-specific sections', () => {
    const correction: CorrectionTask = {
      correction_task_id: 'F001-T01-C1',
      parent_task_id: 'F001-T01',
      feature_id: '001-widgets',
      title: 'Fix widget bug',
      objective: 'Fix it.',
      first_executable_step: 'Reproduce the bug in a test.',
      minimum_progress_evidence: ['test added'],
      review_findings: ['missing edge case'],
      scope: { allowed_paths: ['src/widgets.ts'], forbidden_paths: [] },
      constraints: [],
      quality_gates: { before_review: ['npm test'] },
      acceptance_criteria: ['bug fixed'],
    };

    const markdown = renderCorrectionTaskMarkdown(correction);
    expect(markdown).toContain('## Parent Task');
    expect(markdown).toContain('`F001-T01`');
    expect(markdown).toContain('## Review Findings');
    expect(markdown).toContain('- missing edge case');
  });
});

function buildStateCorrection(overrides: Partial<StateCorrectionTask['state_target']> = {}): StateCorrectionTask {
  return {
    task_id: 'F001-T01-C1',
    feature_id: '001-widgets',
    title: 'Repair feature state',
    objective: 'Repair feature state',
    first_executable_step: 'Fix the state doc.',
    minimum_progress_evidence: ['state.md changes'],
    trace: { roadmap_objective: 'x', feature_goal: 'y', state_gap: 'z' },
    state_target: {
      feature_state_path: 'docs/features/001-widgets/state.md',
      project_state_path: null,
      contract_reference: 'src/contracts/state/feature-state.md',
      detected_issue: 'malformed lifecycle state',
      restored_lifecycle_state: 'task_ready',
      restored_active_task: 'F001-T01',
      restored_active_correction_task: 'none',
      ...overrides,
    },
    context: { summary: 'x', relevant_paths: [], relevant_modules: [] },
    scope: { allowed_paths: [], forbidden_paths: [] },
    constraints: [],
    development_policy: { mode: 'documentation_first' },
    quality_gates: { before_review: [] },
    acceptance_criteria: [],
    expected_deliverables: ['documentation'],
  };
}

describe('stateCorrectionTaskToTask / renderStateCorrectionTaskMarkdown', () => {
  test('converts a state correction into a PlannedTask shape', () => {
    const task = stateCorrectionTaskToTask(buildStateCorrection());
    expect(task.task_id).toBe('F001-T01-C1');
    expect(task.development_policy.mode).toBe('documentation_first');
  });

  test('appends a State Target section after the base task markdown', () => {
    const markdown = renderStateCorrectionTaskMarkdown(buildStateCorrection());
    expect(markdown).toContain('## State Target');
    expect(markdown).toContain('- restored_lifecycle_state: task_ready');
    expect(markdown).toContain('- project_state_path: `none`');
  });
});

describe('correctionTaskToTask', () => {
  test('maps a correction task into a PlannedTask with test_guided policy and code+tests deliverables', () => {
    const correction: CorrectionTask = {
      correction_task_id: 'F001-T01-C1',
      parent_task_id: 'F001-T01',
      feature_id: '001-widgets',
      title: 'Fix widget bug',
      objective: 'Fix it.',
      first_executable_step: 'Reproduce the bug in a test.',
      minimum_progress_evidence: ['test added'],
      review_findings: ['missing edge case'],
      scope: { allowed_paths: ['src/widgets.ts'], forbidden_paths: [] },
      constraints: [],
      quality_gates: { before_review: ['npm test'] },
      acceptance_criteria: ['bug fixed'],
    };

    const task = correctionTaskToTask(correction);
    expect(task.development_policy.mode).toBe('test_guided');
    expect(task.expected_deliverables).toEqual(['code', 'tests']);
    expect(task.trace.feature_goal).toBe('Correction for F001-T01');
  });
});

describe('renderDoctorRecoveryTaskMarkdown / renderUnblockTaskMarkdown', () => {
  function buildDoctorRecovery(): DoctorRecoveryTaskMetadata {
    return {
      executor_role: 'doctor',
      review_policy: 'no_review_loop',
      blocker: {
        kind: 'implementation_failure',
        signature: 'implementation-failure-F001-T01',
        recoverability: 'agent',
        observed_state: 'lifecycle=implementation_failed',
        evidence: ['no git diff was produced'],
      },
      restoration_target: {
        lifecycle_state: 'implementation_running',
        active_task: 'F001-T01',
        active_correction_task: 'none',
        active_unblock_task: 'none',
      },
    };
  }

  test('appends Doctor Recovery and Blocker Context sections', () => {
    const markdown = renderDoctorRecoveryTaskMarkdown(buildTask(), buildDoctorRecovery());
    expect(markdown).toContain('## Doctor Recovery');
    expect(markdown).toContain('- executor_role: doctor');
    expect(markdown).toContain('## Blocker Context');
    expect(markdown).toContain('- evidence: no git diff was produced');
  });

  test('renderUnblockTaskMarkdown delegates to renderDoctorRecoveryTaskMarkdown', () => {
    const doctorRecovery = buildDoctorRecovery();
    expect(renderUnblockTaskMarkdown(buildTask(), doctorRecovery)).toBe(
      renderDoctorRecoveryTaskMarkdown(buildTask(), doctorRecovery),
    );
  });
});
