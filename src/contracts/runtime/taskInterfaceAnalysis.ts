import type { ReviewerStatus } from "../reviewer/reviewerContracts.js";

/**
 * Review-time task interface analysis.
 *
 * The goal is to capture the smallest changes that would make future task
 * execution tighter and less ambiguous.
 */
export interface TaskInterfaceAdjustments {
  readonly first_executable_step: string | null;
  readonly minimum_progress_evidence: readonly string[];
  readonly context_additions: readonly string[];
  readonly scope_adjustments: readonly string[];
  readonly acceptance_criteria_adjustments: readonly string[];
  readonly quality_gate_adjustments: readonly string[];
}

export interface TaskInterfaceAnalysis {
  readonly task_id: string;
  readonly review_status: ReviewerStatus;
  readonly summary: string;
  readonly recommended_action:
    | "tighten_task_interface"
    | "document_implementer_limitation"
    | "both"
    | "none";
  readonly perfectible: boolean;
  readonly implementer_limitations: readonly string[];
  readonly task_interface_adjustments: TaskInterfaceAdjustments;
  readonly notes_for_documentation: readonly string[];
}

/**
 * Deterministic primary defect category for a recovery lesson, derived from which of the
 * lesson's own already-structured fields are populated (never free-text classification) -- see
 * classifyRecoveryLessonCategory in src/orchestrator/recoveryLessons.ts. Lets an accumulating
 * reader group/prioritize lessons across unrelated task anchors instead of only ever seeing the
 * single most recently recorded one.
 */
export type RecoveryLessonCategory =
  | "scope_violation"
  | "malformed_quality_gate"
  | "weak_evidence"
  | "task_interface_gap"
  | "other";

export interface RecoveryLesson {
  readonly run_id: string;
  readonly created_at: string;
  readonly feature_id: string;
  readonly task_id: string;
  readonly correction_task_id: string | null;
  readonly review_status: ReviewerStatus;
  readonly category: RecoveryLessonCategory;
  readonly summary: string;
  readonly implementation_notes: string | null;
  readonly review_findings: readonly string[];
  readonly quality_gate_failures: readonly string[];
  readonly recommended_action: TaskInterfaceAnalysis["recommended_action"];
  readonly perfectible: boolean;
  readonly scope_isolation_notes: readonly string[];
  readonly implementer_limitations: readonly string[];
  readonly task_interface_adjustments: TaskInterfaceAnalysis["task_interface_adjustments"];
  readonly notes_for_documentation: readonly string[];
}
