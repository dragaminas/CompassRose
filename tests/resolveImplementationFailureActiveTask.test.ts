import { describe, expect, test } from 'vitest';
import type { FeatureStateSnapshot } from '../src/contracts/state/featureStateSnapshot.js';
import { resolveImplementationFailureActiveTask } from '../src/state/restorationTarget.js';

function createSnapshot(overrides: Partial<FeatureStateSnapshot>): FeatureStateSnapshot {
  return {
    lifecycleState: overrides.lifecycleState ?? 'implementation_failed',
    activeTask: overrides.activeTask ?? 'F002-T04-C2',
    activeCorrectionTask: overrides.activeCorrectionTask ?? 'none',
    activeUnblockTask: overrides.activeUnblockTask ?? 'none',
    blockedBy: overrides.blockedBy ?? [],
    blockedFrom: overrides.blockedFrom ?? null,
  };
}

describe('resolveImplementationFailureActiveTask', () => {
  test('returns snapshot.activeTask when it is not none', () => {
    const snapshot = createSnapshot({ activeTask: 'F002-T04-C2' });
    expect(resolveImplementationFailureActiveTask(snapshot, () => null)).toBe('F002-T04-C2');
  });

  test('falls back to blockedFrom.active_task when activeTask is none', () => {
    const snapshot = createSnapshot({
      activeTask: 'none',
      blockedFrom: {
        lifecycle_state: 'task_ready',
        active_task: 'F002-T04-C2',
        active_correction_task: 'none',
        active_unblock_task: 'none',
      },
    });
    expect(resolveImplementationFailureActiveTask(snapshot, () => null)).toBe('F002-T04-C2');
  });

  // This is the regression test for the F002-T04-C2 task anchor preservation bug.
  // When blockedFrom is cleared (all 'none') but blockedBy still has the
  // implementation_failure blocker with the correct task anchor, the resolver
  // must recover F002-T04-C2 from the blocker instead of returning null.
  test('recovers F002-T04-C2 from blockedBy when both activeTask and blockedFrom are none', () => {
    const snapshot = createSnapshot({
      lifecycleState: 'implementation_running',
      activeTask: 'none',
      blockedFrom: {
        lifecycle_state: 'none',
        active_task: 'none',
        active_correction_task: 'none',
        active_unblock_task: 'none',
      },
      blockedBy: [
        '- kind: implementation_failure',
        '- signature: implementation-failure-F002-T04-C2',
        '- recoverability: agent',
        '- observed_state: lifecycle=implementation_failed; active_task=F002-T04-C2; active_correction_task=none; active_unblock_task=none',
        '- evidence: Implementation for F002-T04-C2 produced no git diff (context_overflow).',
      ],
    });

    expect(
      resolveImplementationFailureActiveTask(snapshot, () => null),
    ).toBe('F002-T04-C2');
  });

  test('falls back to artifact task ID when blockedBy has no recoverable signature', () => {
    const snapshot = createSnapshot({
      activeTask: 'none',
      blockedFrom: null,
      blockedBy: [
        '- kind: implementation_failure',
        '- signature: implementation-failure-unknown',
        '- recoverability: agent',
        '- evidence: some evidence',
      ],
    });

    expect(resolveImplementationFailureActiveTask(snapshot, () => 'F002-T04-C2-U1')).toBe('F002-T04-C2-U1');
  });
});
