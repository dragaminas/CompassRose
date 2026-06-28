/**
 * Coarse step decisions recorded by the runtime.
 *
 * This is intentionally small: it captures the high-level path the loop took
 * without modeling the full execution detail.
 */
export type StepKind =
  | "plan_feature"
  | "plan_task"
  | "plan_subtask"
  | "correct_state"
  | "doctor_recovery_task"
  | "unblock_task"
  | "diagnose_autocorrect"
  | "implement_task"
  | "implement_subtask"
  | "review_task"
  | "review_subtask"
  | "correct_task"
  | "stop"
  | "blocked";

export interface StepDecision {
  readonly kind: StepKind;
  readonly feature_id: string | null;
  readonly task_id: string | null;
  readonly correction_task_id: string | null;
  readonly reason: string;
}
