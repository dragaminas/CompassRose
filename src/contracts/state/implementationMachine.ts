import { ActionType } from "../actions/actionContracts.js";

/**
 * Durable implementation states and their transition events.
 *
 * The runtime uses this file to decide which action is allowed next and what
 * lifecycle state follows once the action emits an event.
 */
export enum ImplementationState {
  // Current runtime control states.
  NO_PENDING_REQUEST = "no_pending_request",
  FINDING_NEXT_FEATURE = "finding_next_feature",

  // Canonical repository lifecycle states.
  NO_COMPASSROSE_DOCUMENTATION = "no_compassrose_documentation",
  REQUEST_PENDING = "request_pending",
  FORMALIZATION_PENDING = "formalization_pending",
  FORMALIZED = "formalized",
  TASK_PLANNING_PENDING = "task_planning_pending",
  TASK_READY = "task_ready",
  IMPLEMENTATION_RUNNING = "implementation_running",
  QUALITY_GATES_PENDING = "quality_gates_pending",
  REVIEW_PENDING = "review_pending",
  CORRECTION_PENDING = "correction_pending",
  IMPLEMENTATION_FAILED = "implementation_failed",
  QUALITY_FAILED = "quality_failed",
  REVIEW_FAILED = "review_failed",
  UNBLOCK_PENDING = "unblock_pending",
  BLOCKED = "blocked",
  COMPLETED = "completed",
}

export const ACTIONS_BY_IMPLEMENTATION_STATE = {
  [ImplementationState.NO_PENDING_REQUEST]: [ActionType.EXIT],
  [ImplementationState.FINDING_NEXT_FEATURE]: [ActionType.FIND_NEXT_FEATURE_REQUEST],
  [ImplementationState.NO_COMPASSROSE_DOCUMENTATION]: [ActionType.DIAGNOSE_REPO],
  [ImplementationState.REQUEST_PENDING]: [ActionType.PLAN_FEATURE],
  [ImplementationState.FORMALIZATION_PENDING]: [ActionType.PLAN_FEATURE],
  [ImplementationState.FORMALIZED]: [ActionType.PLAN_TASK],
  [ImplementationState.TASK_PLANNING_PENDING]: [ActionType.PLAN_TASK],
  [ImplementationState.TASK_READY]: [ActionType.PLAN_SUBTASK],
  [ImplementationState.IMPLEMENTATION_RUNNING]: [ActionType.IMPLEMENT_SUBTASK],
  [ImplementationState.QUALITY_GATES_PENDING]: [ActionType.RUN_QUALITY_GATES],
  [ImplementationState.REVIEW_PENDING]: [ActionType.REVIEW_SUBTASK],
  [ImplementationState.CORRECTION_PENDING]: [ActionType.PLAN_SUBTASK],
  [ImplementationState.IMPLEMENTATION_FAILED]: [
    ActionType.CORRECT_STATE,
    ActionType.PLAN_DOCTOR_RECOVERY,
    ActionType.STOP_WITH_DIAGNOSTIC,
  ],
  [ImplementationState.QUALITY_FAILED]: [
    ActionType.CORRECT_STATE,
    ActionType.PLAN_DOCTOR_RECOVERY,
    ActionType.STOP_WITH_DIAGNOSTIC,
  ],
  [ImplementationState.REVIEW_FAILED]: [
    ActionType.CORRECT_STATE,
    ActionType.PLAN_DOCTOR_RECOVERY,
    ActionType.STOP_WITH_DIAGNOSTIC,
  ],
  [ImplementationState.UNBLOCK_PENDING]: [ActionType.EXECUTE_DOCTOR_RECOVERY],
  [ImplementationState.BLOCKED]: [
    ActionType.CORRECT_STATE,
    ActionType.PLAN_DOCTOR_RECOVERY,
    ActionType.STOP_WITH_DIAGNOSTIC,
  ],
  [ImplementationState.COMPLETED]: [],
} satisfies Record<ImplementationState, readonly ActionType[]>;

export enum ImplementationEvent {
  FEATURE_REQUEST_FOUND = "feature_request_found",
  NO_LEFT_REQUEST_FOUND = "no_left_request_found",
  FEATURE_FORMALIZATION_STARTED = "feature_formalization_started",
  FEATURE_FORMALIZED = "feature_formalized",
  TASK_PLANNING_STARTED = "task_planning_started",
  TASK_PLANNED = "task_planned",
  SUBTASK_PLANNED = "subtask_planned",
  IMPLEMENTATION_COMPLETED = "implementation_completed",
  QUALITY_GATES_PASSED = "quality_gates_passed",
  QUALITY_GATES_FAILED = "quality_gates_failed",
  REVIEW_APPROVED = "review_approved",
  REVIEW_CHANGES_REQUIRED = "review_changes_required",
  REVIEW_FAILED = "review_failed",
  REVIEW_BLOCKED = "review_blocked",
  CORRECTION_STARTED = "correction_started",
  CORRECTION_COMPLETED = "correction_completed",
  DOCTOR_RECOVERY_STARTED = "doctor_recovery_started",
  DOCTOR_RECOVERY_COMPLETED = "doctor_recovery_completed",
  STATE_CORRECTED_TO_NO_COMPASSROSE_DOCUMENTATION = "state_corrected_to_no_compassrose_documentation",
  STATE_CORRECTED_TO_REQUEST_PENDING = "state_corrected_to_request_pending",
  STATE_CORRECTED_TO_FORMALIZATION_PENDING = "state_corrected_to_formalization_pending",
  STATE_CORRECTED_TO_FORMALIZED = "state_corrected_to_formalized",
  STATE_CORRECTED_TO_TASK_PLANNING_PENDING = "state_corrected_to_task_planning_pending",
  STATE_CORRECTED_TO_TASK_READY = "state_corrected_to_task_ready",
  STATE_CORRECTED_TO_IMPLEMENTATION_RUNNING = "state_corrected_to_implementation_running",
  STATE_CORRECTED_TO_QUALITY_GATES_PENDING = "state_corrected_to_quality_gates_pending",
  STATE_CORRECTED_TO_REVIEW_PENDING = "state_corrected_to_review_pending",
  STATE_CORRECTED_TO_CORRECTION_PENDING = "state_corrected_to_correction_pending",
  STATE_CORRECTED_TO_IMPLEMENTATION_FAILED = "state_corrected_to_implementation_failed",
  STATE_CORRECTED_TO_QUALITY_FAILED = "state_corrected_to_quality_failed",
  STATE_CORRECTED_TO_REVIEW_FAILED = "state_corrected_to_review_failed",
  STATE_CORRECTED_TO_UNBLOCK_PENDING = "state_corrected_to_unblock_pending",
  STATE_CORRECTED_TO_BLOCKED = "state_corrected_to_blocked",
  STATE_CORRECTED_TO_COMPLETED = "state_corrected_to_completed",
}

export const NEXT_STATE_BY_IMPLEMENTATION_EVENT = {
  [ImplementationEvent.FEATURE_REQUEST_FOUND]: ImplementationState.REQUEST_PENDING,
  [ImplementationEvent.NO_LEFT_REQUEST_FOUND]: ImplementationState.NO_PENDING_REQUEST,
  [ImplementationEvent.FEATURE_FORMALIZATION_STARTED]: ImplementationState.FORMALIZATION_PENDING,
  [ImplementationEvent.FEATURE_FORMALIZED]: ImplementationState.FORMALIZED,
  [ImplementationEvent.TASK_PLANNING_STARTED]: ImplementationState.TASK_PLANNING_PENDING,
  [ImplementationEvent.TASK_PLANNED]: ImplementationState.TASK_READY,
  [ImplementationEvent.SUBTASK_PLANNED]: ImplementationState.IMPLEMENTATION_RUNNING,
  [ImplementationEvent.IMPLEMENTATION_COMPLETED]: ImplementationState.QUALITY_GATES_PENDING,
  [ImplementationEvent.QUALITY_GATES_PASSED]: ImplementationState.REVIEW_PENDING,
  [ImplementationEvent.QUALITY_GATES_FAILED]: ImplementationState.QUALITY_FAILED,
  [ImplementationEvent.REVIEW_APPROVED]: ImplementationState.COMPLETED,
  [ImplementationEvent.REVIEW_CHANGES_REQUIRED]: ImplementationState.CORRECTION_PENDING,
  [ImplementationEvent.REVIEW_FAILED]: ImplementationState.REVIEW_FAILED,
  [ImplementationEvent.REVIEW_BLOCKED]: ImplementationState.BLOCKED,
  [ImplementationEvent.CORRECTION_STARTED]: ImplementationState.CORRECTION_PENDING,
  [ImplementationEvent.CORRECTION_COMPLETED]: ImplementationState.IMPLEMENTATION_RUNNING,
  [ImplementationEvent.DOCTOR_RECOVERY_STARTED]: ImplementationState.UNBLOCK_PENDING,
  [ImplementationEvent.DOCTOR_RECOVERY_COMPLETED]: ImplementationState.IMPLEMENTATION_RUNNING,
  [ImplementationEvent.STATE_CORRECTED_TO_NO_COMPASSROSE_DOCUMENTATION]:
    ImplementationState.NO_COMPASSROSE_DOCUMENTATION,
  [ImplementationEvent.STATE_CORRECTED_TO_REQUEST_PENDING]: ImplementationState.REQUEST_PENDING,
  [ImplementationEvent.STATE_CORRECTED_TO_FORMALIZATION_PENDING]:
    ImplementationState.FORMALIZATION_PENDING,
  [ImplementationEvent.STATE_CORRECTED_TO_FORMALIZED]: ImplementationState.FORMALIZED,
  [ImplementationEvent.STATE_CORRECTED_TO_TASK_PLANNING_PENDING]:
    ImplementationState.TASK_PLANNING_PENDING,
  [ImplementationEvent.STATE_CORRECTED_TO_TASK_READY]: ImplementationState.TASK_READY,
  [ImplementationEvent.STATE_CORRECTED_TO_IMPLEMENTATION_RUNNING]:
    ImplementationState.IMPLEMENTATION_RUNNING,
  [ImplementationEvent.STATE_CORRECTED_TO_QUALITY_GATES_PENDING]:
    ImplementationState.QUALITY_GATES_PENDING,
  [ImplementationEvent.STATE_CORRECTED_TO_REVIEW_PENDING]: ImplementationState.REVIEW_PENDING,
  [ImplementationEvent.STATE_CORRECTED_TO_CORRECTION_PENDING]:
    ImplementationState.CORRECTION_PENDING,
  [ImplementationEvent.STATE_CORRECTED_TO_IMPLEMENTATION_FAILED]:
    ImplementationState.IMPLEMENTATION_FAILED,
  [ImplementationEvent.STATE_CORRECTED_TO_QUALITY_FAILED]: ImplementationState.QUALITY_FAILED,
  [ImplementationEvent.STATE_CORRECTED_TO_REVIEW_FAILED]: ImplementationState.REVIEW_FAILED,
  [ImplementationEvent.STATE_CORRECTED_TO_UNBLOCK_PENDING]: ImplementationState.UNBLOCK_PENDING,
  [ImplementationEvent.STATE_CORRECTED_TO_BLOCKED]: ImplementationState.BLOCKED,
  [ImplementationEvent.STATE_CORRECTED_TO_COMPLETED]: ImplementationState.COMPLETED,
} satisfies Record<ImplementationEvent, ImplementationState>;
