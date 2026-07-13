import { describe, expect, test } from 'vitest';
import type { FeatureStateSnapshot } from '../src/contracts/state/featureStateSnapshot.js';
import type { StateCorrectionTask } from '../src/contracts/task/taskContracts.js';
import {
  forwardRestorationLifecycleState,
  preferredRestorationTarget,
  resolveImplementationFailureActiveTask,
  restorationTargetNextPlanningHint,
  restorationTargetProjectPendingLines,
  stateCorrectionNextPlanningHint,
  stateCorrectionProjectPendingLines,
} from '../src/state/restorationTarget.js';

function buildSnapshot(overrides: Partial<FeatureStateSnapshot> = {}): FeatureStateSnapshot {
  return {
    lifecycleState: 'quality_failed',
    activeTask: 'none',
    activeCorrectionTask: 'none',
    activeUnblockTask: 'none',
    blockedBy: [],
    blockedFrom: null,
    ...overrides,
  };
}

describe('forwardRestorationLifecycleState', () => {
  test.each(['implementation_failed', 'quality_failed', 'review_failed'])(
    'maps %s to implementation_running',
    (lifecycleState) => {
      expect(forwardRestorationLifecycleState(lifecycleState)).toBe('implementation_running');
    },
  );

  test('leaves other lifecycle states unchanged', () => {
    expect(forwardRestorationLifecycleState('task_ready')).toBe('task_ready');
    expect(forwardRestorationLifecycleState('blocked')).toBe('blocked');
  });
});

describe('preferredRestorationTarget', () => {
  test('prefers an explicit Blocked From anchor over the current lifecycle state', () => {
    const snapshot = buildSnapshot({
      blockedFrom: {
        lifecycle_state: 'implementation_running',
        active_task: 'F1-T1',
        active_correction_task: 'none',
        active_unblock_task: 'none',
      },
    });

    expect(preferredRestorationTarget(snapshot)).toEqual(snapshot.blockedFrom);
  });

  test('falls back to the forward-progress lifecycle state when there is no Blocked From anchor', () => {
    const snapshot = buildSnapshot({ lifecycleState: 'quality_failed', activeTask: 'F1-T1' });

    expect(preferredRestorationTarget(snapshot)).toEqual({
      lifecycle_state: 'implementation_running',
      active_task: 'F1-T1',
      active_correction_task: 'none',
      active_unblock_task: 'none',
    });
  });

  test('ignores a Blocked From anchor whose lifecycle_state is "none"', () => {
    const snapshot = buildSnapshot({
      lifecycleState: 'quality_failed',
      blockedFrom: { lifecycle_state: 'none', active_task: 'none', active_correction_task: 'none', active_unblock_task: 'none' },
    });

    expect(preferredRestorationTarget(snapshot).lifecycle_state).toBe('implementation_running');
  });
});

describe('resolveImplementationFailureActiveTask', () => {
  test('returns the recorded active task when one is set', () => {
    const snapshot = buildSnapshot({ activeTask: 'F1-T1' });
    expect(resolveImplementationFailureActiveTask(snapshot, () => null)).toBe('F1-T1');
  });

  test('falls back to the Blocked From active task', () => {
    const snapshot = buildSnapshot({
      blockedFrom: { lifecycle_state: 'implementation_running', active_task: 'F1-T2', active_correction_task: 'none', active_unblock_task: 'none' },
    });
    expect(resolveImplementationFailureActiveTask(snapshot, () => null)).toBe('F1-T2');
  });

  test('parses a task id out of an implementation-failure blocker signature line', () => {
    const snapshot = buildSnapshot({ blockedBy: ['signature: implementation-failure-F1-T3'] });
    expect(resolveImplementationFailureActiveTask(snapshot, () => null)).toBe('F1-T3');
  });

  test('ignores a signature line whose captured id does not look like a task id', () => {
    const snapshot = buildSnapshot({ blockedBy: ['signature: implementation-failure-not-a-task-id'] });
    expect(resolveImplementationFailureActiveTask(snapshot, () => 'fallback')).toBe('fallback');
  });

  test('falls back to findAttemptTaskId when nothing else resolves', () => {
    const snapshot = buildSnapshot();
    expect(resolveImplementationFailureActiveTask(snapshot, () => 'F1-T9')).toBe('F1-T9');
    expect(resolveImplementationFailureActiveTask(snapshot, () => null)).toBeNull();
  });
});

describe('restorationTargetNextPlanningHint / restorationTargetProjectPendingLines', () => {
  test.each([
    ['task_ready', /Execute `F1-T1`/],
    ['review_pending', /Review `F1-T1`/],
    ['implementation_running', /Resume `F1-T1`/],
    ['formalized', /Plan the next task/],
    ['unblock_pending', /Execute doctor recovery task `F1-T1`/],
  ] as const)('produces a hint for lifecycle_state %s', (lifecycleState, pattern) => {
    const target = { lifecycle_state: lifecycleState, active_task: 'F1-T1', active_correction_task: 'none', active_unblock_task: 'none' };
    expect(restorationTargetNextPlanningHint(target, 'F1-T1')).toMatch(pattern);
  });

  test('distinguishes doctor/unblock correction_pending from a plain task correction_pending', () => {
    const target = { lifecycle_state: 'correction_pending', active_task: 'F1-T1', active_correction_task: 'none', active_unblock_task: 'none' };
    expect(restorationTargetNextPlanningHint(target, 'F1-T1', 'doctor')).toContain('doctor recovery task');
    expect(restorationTargetNextPlanningHint(target, 'F1-T1', 'task')).toContain('correction task');
  });

  test('falls back to a generic "continue from" hint for an unrecognized lifecycle state', () => {
    const target = { lifecycle_state: 'some_custom_state', active_task: 'F1-T1', active_correction_task: 'none', active_unblock_task: 'none' };
    expect(restorationTargetNextPlanningHint(target, 'F1-T1')).toContain('some_custom_state');
  });

  test('restorationTargetProjectPendingLines always includes the bookkeeping reminder line', () => {
    const target = { lifecycle_state: 'task_ready', active_task: 'F1-T1', active_correction_task: 'none', active_unblock_task: 'none' };
    const lines = restorationTargetProjectPendingLines(target, 'F1-T1');
    expect(lines[1]).toBe('Continue updating this file with approved repository facts as feature work lands.');
  });
});

describe('stateCorrectionNextPlanningHint / stateCorrectionProjectPendingLines', () => {
  function buildStateCorrection(overrides: Partial<StateCorrectionTask['state_target']> = {}): StateCorrectionTask {
    return {
      task_id: 'F1-T1-C1',
      feature_id: '001-widgets',
      title: 'Repair feature state',
      objective: 'Repair feature state',
      first_executable_step: 'Fix the state doc.',
      minimum_progress_evidence: ['state.md changes'],
      trace: { roadmap_objective: 'x', feature_goal: 'y', state_gap: 'z' },
      state_target: {
        feature_state_path: 'docs/features/001-widgets/state.md',
        project_state_path: null,
        contract_reference: '',
        detected_issue: '',
        restored_lifecycle_state: 'task_ready',
        restored_active_task: 'F1-T1',
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

  test('derives the planning hint from the state correction\'s restored lifecycle state', () => {
    const stateCorrection = buildStateCorrection();
    expect(stateCorrectionNextPlanningHint(stateCorrection)).toContain('Execute `F1-T1-C1`');
  });

  test('derives the project pending lines the same way', () => {
    const stateCorrection = buildStateCorrection({ restored_lifecycle_state: 'review_pending' });
    const lines = stateCorrectionProjectPendingLines(stateCorrection);
    expect(lines[0]).toContain('Review `F1-T1-C1`');
  });
});
