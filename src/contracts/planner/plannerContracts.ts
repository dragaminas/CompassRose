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
  readonly task_requests: readonly TaskRequest[];
}

/**
 * Formalization output for a fix request (see docs/fixes/README.md). A fix has no
 * architecture.md — it repairs already-shipped behavior rather than introducing new
 * architectural surface.
 */
export interface PlannedFixDocs {
  readonly fix_id: string;
  readonly fix_md: string;
  readonly state_md: string;
  readonly summary: string;
}

export type FixSeverity = "critical" | "high" | "medium" | "low";

export type TaskRequestStatus = "not_started" | "in_progress" | "complete" | "superseded";

export interface TaskRequestScope {
  readonly allowed_paths: readonly string[];
  readonly forbidden_paths: readonly string[];
}

/**
 * Distinct from TaskScopeJustification below on purpose: this check runs once per task
 * request at feature-formalization time, holistically, while the planner has full
 * feature+architecture context (see src/planner/siblingFeatureIndex.ts). The
 * scope_justification check on PlannedTask runs again later, per task, at elaboration
 * time, as a rarer secondary fallback. Sharing one field name across both stages would
 * make logs/errors ambiguous about which stage caught a given case.
 */
export interface TaskRequestSiblingCheck {
  readonly considered_features: readonly string[];
  readonly belongs_to_other_feature: string | null;
}

/**
 * A pre-declared, locked-in boundary for a future task, produced once during feature
 * formalization (see PlannedFeatureDocs.task_requests) rather than invented fresh by
 * every later planTask() call. This is the structural anti-drift mechanism: later
 * task elaboration is constrained to stay within `scope`, checked deterministically
 * (see allPathsAllowedByPrefix/pathsExceedingPrefixes in src/shared/pathPrefix.ts)
 * instead of relying solely on the planner's own self-reported honesty.
 */
export interface TaskRequest {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly scope: TaskRequestScope;
  readonly status: TaskRequestStatus;
  readonly sibling_check: TaskRequestSiblingCheck;
}

/**
 * Backfill-only shape: a TaskRequest plus which already-existing task anchors (see
 * primaryTaskAnchorFromId in src/orchestrator/runtimeHelpers.ts) it accounts for. Used solely
 * by the one-time backfillTaskRequests() reconciliation (src/orchestrator/taskRequests.ts) for
 * a feature formalized before task requests existed -- covers_existing_task_ids is stripped
 * before the result is persisted as a plain TaskRequest[] (see stripBackfillMetadata), so every
 * other consumer only ever sees the canonical TaskRequest shape regardless of how it was made.
 */
export interface BackfilledTaskRequest extends TaskRequest {
  readonly covers_existing_task_ids: readonly string[];
}

export interface TaskRequestBackfillOutput {
  readonly task_requests: readonly BackfilledTaskRequest[];
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

/**
 * Grounds a planned task against the feature it's proposed for: which of that feature's
 * own declared scope items it satisfies, which "does not include" items it must avoid,
 * and — if the planner recognizes the behavior as belonging to a sibling feature instead
 * (see src/planner/siblingFeatureIndex.ts and src/contracts/planner/feature-scope-guard.md)
 * — which one, so the orchestrator can refuse to write the task instead of letting scope
 * drift accumulate one plausible-looking task at a time.
 */
export interface TaskScopeJustification {
  readonly included_by: string;
  readonly excluded_by: readonly string[];
  readonly belongs_to_other_feature: string | null;
  /**
   * Set only when this task elaborates a pre-declared TaskRequest and genuinely must exceed
   * its locked-in `scope.allowed_paths` boundary (see src/orchestrator/taskRequests.ts's
   * checkTaskRequestContainment). An honest, specific reason here lets the orchestrator widen
   * the task request's own boundary instead of either silently allowing drift or refusing a
   * legitimately necessary task. Absent or null when no task request is in play, or when the
   * task stays within its declared boundary.
   */
  readonly deviation_reason: string | null;
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
  // Optional on the type (not every PlannedTask comes from a real planner call — see
  // correctionTaskToTask/stateCorrectionTaskToTask in src/orchestrator/taskRendering.ts,
  // which build this shape for rendering an existing correction, not a new proposal), but
  // required in output.schema.json so a genuine planner_output response always includes it.
  readonly scope_justification?: TaskScopeJustification;
}

export interface PlannerOutput {
  readonly task: PlannedTask;
}
