import type { FeatureStateSnapshot } from '../contracts/state/featureStateSnapshot.js';
import type { RestorationTarget, StateCorrectionTask } from '../contracts/task/taskContracts.js';

// A blocker is diagnosed FROM a failed/blocked lifecycle state, so restoring into that same
// state would immediately re-trigger the identical diagnosis on the next step. When no explicit
// `## Blocked From` anchor was recorded, fall back to the state machine's own documented forward
// transition (see src/contracts/state/feature-state.md) instead of echoing the broken state.
export function forwardRestorationLifecycleState(lifecycleState: string): string {
  switch (lifecycleState) {
    case 'implementation_failed':
    case 'quality_failed':
    case 'review_failed':
      return 'implementation_running';
    default:
      return lifecycleState;
  }
}

export function preferredRestorationTarget(snapshot: FeatureStateSnapshot): RestorationTarget {
  if (snapshot.blockedFrom && snapshot.blockedFrom.lifecycle_state !== 'none') {
    return snapshot.blockedFrom;
  }

  return {
    lifecycle_state: forwardRestorationLifecycleState(snapshot.lifecycleState),
    active_task: snapshot.activeTask,
    active_correction_task: snapshot.activeCorrectionTask,
  };
}

/**
 * Resolves the active task to resume for an `implementation_failed` blocker: the recorded
 * active task if there is one, else the task the feature was blocked from, else a task id
 * hint parsed out of the blocker evidence, else whatever `findAttemptTaskId` can recover
 * (typically the most recently written task/implementation-attempt artifact).
 */
export function resolveImplementationFailureActiveTask(
  snapshot: FeatureStateSnapshot,
  findAttemptTaskId: () => string | null,
): string | null {
  if (snapshot.activeTask !== 'none') {
    return snapshot.activeTask;
  }

  if (snapshot.blockedFrom?.active_task && snapshot.blockedFrom.active_task !== 'none') {
    return snapshot.blockedFrom.active_task;
  }

  for (const line of snapshot.blockedBy) {
    const signatureMatch = line.match(/signature:\s*implementation-failure-(.+)/i);
    const taskIdCandidate = signatureMatch?.[1];
    if (taskIdCandidate) {
      const taskId = taskIdCandidate.trim();
      if (/^F\d+-T\d+/.test(taskId)) {
        return taskId;
      }
    }
  }

  return findAttemptTaskId();
}

export function restorationTargetNextPlanningHint(
  restorationTarget: RestorationTarget,
  activeTaskId: string,
  activeTaskLabel: 'state_correction' | 'task' = 'task',
): string {
  switch (restorationTarget.lifecycle_state) {
    case 'task_ready':
      return `Execute \`${activeTaskId}\` when the current execution mode allows it.`;
    case 'review_pending':
      return `Review \`${activeTaskId}\` next.`;
    case 'implementation_running':
      return `Resume \`${activeTaskId}\` implementation recovery before continuing.`;
    case 'formalized':
      return 'Plan the next task that advances this feature from the remaining gap.';
    case 'correction_pending':
      return `Execute correction task \`${activeTaskId}\` next.`;
    default:
      return `Continue from the repaired \`${restorationTarget.lifecycle_state}\` state for \`${activeTaskId}\`.`;
  }
}

export function restorationTargetProjectPendingLines(
  restorationTarget: RestorationTarget,
  activeTaskId: string,
  activeTaskLabel: 'state_correction' | 'task' = 'task',
): string[] {
  switch (restorationTarget.lifecycle_state) {
    case 'task_ready':
      return [
        `Execute \`${activeTaskId}\` for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'review_pending':
      return [
        `Review \`${activeTaskId}\` for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'implementation_running':
      return [
        `Recover the implementation of \`${activeTaskId}\` before continuing.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'formalized':
      return [
        'Plan the next implementation task for the active feature.',
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    case 'correction_pending':
      return [
        `Execute correction task \`${activeTaskId}\` for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
    default:
      return [
        `Continue from the repaired \`${restorationTarget.lifecycle_state}\` state for the active feature.`,
        'Continue updating this file with approved repository facts as feature work lands.',
      ];
  }
}

export function stateCorrectionNextPlanningHint(stateCorrection: StateCorrectionTask): string {
  return restorationTargetNextPlanningHint({
    lifecycle_state: stateCorrection.state_target.restored_lifecycle_state,
    active_task: stateCorrection.state_target.restored_active_task,
    active_correction_task: stateCorrection.state_target.restored_active_correction_task,
  }, stateCorrection.task_id, 'state_correction');
}

export function stateCorrectionProjectPendingLines(stateCorrection: StateCorrectionTask): string[] {
  return restorationTargetProjectPendingLines({
    lifecycle_state: stateCorrection.state_target.restored_lifecycle_state,
    active_task: stateCorrection.state_target.restored_active_task,
    active_correction_task: stateCorrection.state_target.restored_active_correction_task,
  }, stateCorrection.task_id, 'state_correction');
}
