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
  /**
   * "waived" means the command exited non-zero, but the failure was confirmed to already exist
   * on a clean checkout of the active task's own baseline (before its diff) and to be unrelated
   * to the task's allowed_paths -- so it is not this task's defect and must not block it. See
   * reclassifyUnrelatedGateFailure() in src/orchestrator/orchestrator.ts.
   */
  readonly status: "passed" | "failed" | "skipped" | "waived";
  readonly output_summary: string;
  /**
   * The file paths the failing command's own raw output referenced, captured before they get
   * folded into output_summary's human-readable prose (which also quotes the task's own
   * allowed_paths/changed files for context). Only populated for "waived" results. Callers that
   * need to know which file was actually implicated (e.g. blockOnUnrelatedFixFailure() naming a
   * fix after it) must read this field instead of re-parsing output_summary -- re-parsing picks
   * up the task's own quoted paths first and misattributes the failure to them. See
   * tryWaiveUnrelatedGateFailure() in src/orchestrator/orchestrator.ts.
   */
  readonly referenced_paths?: readonly string[];
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
