/**
 * Coarse step decisions recorded by the runtime.
 *
 * This is intentionally small: it captures the high-level path the loop took
 * without modeling the full execution detail.
 */
export type StepKind =
  | "plan_feature"
  | "plan_task"
  | "plan_fix"
  | "plan_fix_task"
  | "plan_subtask"
  | "correct_state"
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
  /**
   * The id of the active work item. For `plan_fix`/`plan_fix_task` this is a fix's
   * directory id under fixes_root; for every other kind it's a feature's directory id
   * under features_root (or, for task-scoped kinds, resolved transparently by
   * resolveWorkItemContext() from the task's own feature_id/fix_id). The field name is
   * unchanged for either case -- see compassrose/fixes/README.md.
   */
  readonly feature_id: string | null;
  readonly task_id: string | null;
  readonly correction_task_id: string | null;
  readonly reason: string;
}
