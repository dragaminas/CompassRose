/**
 * Shared vocabulary for work items.
 *
 * These are the small base types that both planning and execution contracts
 * build on top of.
 */
export type DevelopmentPolicyMode =
  | "test_guided"
  | "implementation_first"
  | "documentation_first"
  | "strict_tdd";

export type ExpectedDeliverable = "code" | "tests" | "documentation";

export interface TaskTrace {
  readonly roadmap_objective: string;
  readonly feature_goal: string;
  readonly state_gap: string;
}

export interface TaskContext {
  readonly summary: string;
  readonly relevant_paths: readonly string[];
  readonly relevant_modules: readonly string[];
}

export interface TaskScope {
  readonly allowed_paths: readonly string[];
  readonly forbidden_paths: readonly string[];
}

export interface TaskDevelopmentPolicy {
  readonly mode: DevelopmentPolicyMode;
}

export interface TaskQualityGates {
  readonly before_review: readonly string[];
}
