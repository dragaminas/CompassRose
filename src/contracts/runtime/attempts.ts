import type { StepDecision } from "./stepDecision.js";

/**
 * Implementation attempt and diagnostic results.
 *
 * These are the runtime records that explain what happened during execution
 * and what evidence was produced.
 */
export type DiagnosticClassification =
  | "context_overflow"
  | "provider_failure"
  | "permission_prompt"
  | "reviewable_diff_lost"
  | "already_complete"
  | "tool_refusal"
  | "missing_implementation_notes"
  | "model_passivity"
  | "ui_cli_behavior"
  | "unknown";

export interface QualityGateResult {
  readonly name: string;
  readonly command: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly output_summary: string;
}

export interface ImplementationDiagnostics {
  readonly classification: DiagnosticClassification;
  readonly evidence: readonly string[];
  readonly first_executable_step_status: "attempted" | "not_attempted" | "unknown";
  readonly minimum_progress_evidence_status: "present" | "absent" | "unknown";
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly timed_out: boolean;
  readonly command_invoked: string | null;
}

export interface ImplementationAttempt {
  readonly status: "success" | "failed";
  readonly changed_files: readonly string[];
  readonly git_diff: string;
  readonly fallback_changed_files: readonly string[];
  readonly fallback_git_diff: string | null;
  readonly raw_output: string;
  readonly implementation_notes: string | null;
  readonly diagnostics: ImplementationDiagnostics;
  readonly error: string | null;
}

export interface ImplementationAttemptHistory {
  readonly task_id: string;
  readonly retried_after_partial_changes: boolean;
  readonly attempts: readonly ImplementationAttempt[];
  readonly final_attempt: ImplementationAttempt;
}

export interface RefinementFeedback {
  readonly run_id: string;
  readonly created_at: string;
  readonly trigger: string;
  readonly selected_step: StepDecision | null;
  readonly likely_sources: readonly string[];
  readonly observations: readonly string[];
  readonly next_questions: readonly string[];
}
