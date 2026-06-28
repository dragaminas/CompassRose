import type {
  DevelopmentPolicyMode,
  ExpectedDeliverable,
  TaskContext,
  TaskDevelopmentPolicy,
  TaskQualityGates,
  TaskScope,
  TaskTrace,
} from "../task/workItem.js";

/**
 * Planning artifacts for features and tasks.
 *
 * This file keeps the planner-facing contracts in one place so the runtime
 * can read them without pulling in the rest of the task/reviewer vocabulary.
 */
export interface PlannedFeatureDocs {
  readonly feature_id: string;
  readonly feature_md: string;
  readonly architecture_md: string;
  readonly state_md: string;
  readonly summary: string;
}

export type PlannerLifecycleState =
  | "formalization_pending"
  | "formalized"
  | "task_planning_pending"
  | "task_ready"
  | "implementation_running"
  | "implementation_failed"
  | "quality_gates_pending"
  | "quality_failed"
  | "review_pending"
  | "review_failed"
  | "correction_pending"
  | "unblock_pending"
  | "blocked"
  | "completed";

export type PlannerExecutionMode = "interactive" | "semi_automatic" | "automatic";

export type PlannerResultStatus = "complete" | "not_started";
export type PlannerAttemptResult = "not_run" | "passed" | "failed";
export type PlannerReviewResult = "not_run" | "approved" | "changes_required" | "blocked" | "failed" | "skipped";

export interface PlannerRoadmapContext {
  readonly source: string;
  readonly relevant_objectives: readonly string[];
}

export interface PlannerFeatureContext {
  readonly source: string;
  readonly purpose: string;
  readonly goals: readonly string[];
  readonly acceptance_criteria: readonly string[];
  readonly implementation_deliverables: readonly string[];
  readonly completion_criteria: readonly string[];
  readonly implementation_outline: readonly string[];
}

export interface PlannerArchitectureBoundaries {
  readonly allowed: readonly string[];
  readonly forbidden: readonly string[];
}

export interface PlannerArchitectureContext {
  readonly source: string;
  readonly relevant_modules: readonly string[];
  readonly boundaries: PlannerArchitectureBoundaries;
  readonly constraints: readonly string[];
}

export interface PlannerBlockedFromState {
  readonly lifecycle_state: string | "none";
  readonly active_task: string | "none";
  readonly active_correction_task: string | "none";
  readonly active_unblock_task: string | "none";
}

export interface PlannerOperationalStatus {
  readonly formalization: PlannerResultStatus;
  readonly active_task: string | "none";
  readonly active_correction_task: string | "none";
  readonly active_unblock_task: string | "none";
  readonly last_implementation_result: PlannerAttemptResult;
  readonly last_quality_gate_result: "unknown" | "passed" | "failed" | "skipped";
  readonly last_review_result: PlannerReviewResult;
  readonly last_unblock_result: "not_run" | "passed" | "failed" | "skipped";
}

export interface PlannerStateContext {
  readonly source: string;
  readonly lifecycle_state: PlannerLifecycleState;
  readonly operational_status: PlannerOperationalStatus;
  readonly implemented_deliverables: readonly string[];
  readonly remaining_deliverables: readonly string[];
  readonly outline_progress: readonly string[];
  readonly known_gaps: readonly string[];
  readonly blockers: readonly string[];
  readonly blocked_from: PlannerBlockedFromState;
  readonly next_planning_hint: string | null;
}

export interface PlannerProjectStateContext {
  readonly source: string;
  readonly summary: string;
}

export interface PlannerConfigurationContext {
  readonly execution_mode: PlannerExecutionMode;
  readonly development_policy: DevelopmentPolicyMode;
  readonly quality_gates: TaskQualityGates;
  readonly limits: {
    readonly max_files_per_task: number;
  };
}

export interface PlannerRepositoryContext {
  readonly root: string;
  readonly relevant_paths: readonly string[];
  readonly summary: string;
}

export interface PlannerInput {
  readonly run_id: string;
  readonly feature_id: string;
  readonly feature_name: string;
  readonly roadmap_context: PlannerRoadmapContext;
  readonly feature: PlannerFeatureContext;
  readonly architecture: PlannerArchitectureContext;
  readonly state: PlannerStateContext;
  readonly project_state: PlannerProjectStateContext;
  readonly configuration: PlannerConfigurationContext;
  readonly repository_context: PlannerRepositoryContext;
  readonly planning_hint: string | null;
}

export interface PlannedTask {
  readonly task_id: string;
  readonly previous_task_id?: string | null;
  readonly feature_id: string;
  readonly title: string;
  readonly objective: string;
  readonly first_executable_step: string;
  readonly minimum_progress_evidence: readonly string[];
  readonly trace: TaskTrace;
  readonly context: TaskContext;
  readonly scope: TaskScope;
  readonly constraints: readonly string[];
  readonly development_policy: TaskDevelopmentPolicy;
  readonly quality_gates: TaskQualityGates;
  readonly acceptance_criteria: readonly string[];
  readonly expected_deliverables: readonly ExpectedDeliverable[];
}

export interface PlannerOutput {
  readonly task: PlannedTask;
}
