import type { CorrectionTask, ReviewableDiffHandoff } from "../task/taskContracts.js";
import type { ImplementationDiagnostics, QualityGateResult } from "../runtime/attempts.js";
import type { TaskScope } from "../task/workItem.js";

/**
 * Reviewer-facing contracts.
 *
 * These types describe the result of a review and the reviewer terminology
 * used to judge whether a task should continue, correct, or stop.
 */
export type ReviewerStatus = "approved" | "changes_required" | "blocked" | "failed";

export interface ReviewerTaskInput {
  readonly task_id: string;
  readonly feature_id: string;
  readonly title: string;
  readonly objective: string;
  readonly first_executable_step: string;
  readonly minimum_progress_evidence: readonly string[];
  readonly acceptance_criteria: readonly string[];
  readonly scope: TaskScope;
  readonly constraints: readonly string[];
  readonly reviewable_diff_handoff: ReviewableDiffHandoff;
}

export interface ReviewerImplementationInput {
  readonly changed_files: readonly string[];
  readonly git_diff: string;
  readonly fallback_changed_files: readonly string[];
  readonly fallback_git_diff: string | null;
  readonly implementation_notes: string | null;
  readonly diagnostics: ImplementationDiagnostics;
}

export interface ReviewerValidationInput {
  readonly quality_gates: readonly QualityGateResult[];
}

export interface ReviewerFeatureContextInput {
  readonly feature_source: string;
  readonly architecture_source: string;
  readonly state_source: string;
}

export interface ReviewerPolicyInput {
  readonly require_tests: boolean;
  readonly allow_unrelated_changes: boolean;
  readonly allow_architectural_changes: boolean;
}

export interface ReviewerInput {
  readonly run_id: string;
  readonly task: ReviewerTaskInput;
  readonly implementation: ReviewerImplementationInput;
  readonly validation: ReviewerValidationInput;
  readonly feature_context: ReviewerFeatureContextInput;
  readonly review_policy: ReviewerPolicyInput;
}

export interface ReviewerAcceptanceCriterion {
  readonly criterion: string;
  readonly status: "passed" | "failed" | "not_verified";
  readonly notes: string;
}

export interface ReviewerFinding {
  readonly severity: "info" | "warning" | "error" | "blocker";
  readonly message: string;
  readonly path: string | null;
  readonly related_acceptance_criterion: string | null;
}

export interface ReviewerOutput {
  readonly task_id: string;
  readonly status: ReviewerStatus;
  readonly summary: string;
  readonly acceptance: {
    readonly criteria: readonly ReviewerAcceptanceCriterion[];
  };
  readonly findings: readonly ReviewerFinding[];
  readonly scope_check: {
    readonly status: "passed" | "failed";
    readonly unrelated_changes: readonly string[];
  };
  readonly quality_gate_check: {
    readonly status: "passed" | "failed" | "skipped";
    readonly failed_gates: readonly string[];
  };
  readonly correction_task: CorrectionTask | null;
  readonly project_state_update_hint: string | null;
}
