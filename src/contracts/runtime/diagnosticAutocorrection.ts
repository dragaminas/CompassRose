/**
 * Deterministic diagnostic/autocorrection contracts.
 *
 * These types describe the small decision space used when the repository is
 * broken and CompassRose must choose the safest recovery path.
 */
export type BlockerKind =
  | "state_corruption"
  | "task_interface_gap"
  | "cli_mismatch"
  | "environment"
  | "implementation_failure"
  | "review_failure"
  // The application does not start, even though everything else about the work checks out
  // (029-runnable-application-gate). Distinct from implementation_failure on purpose: the change
  // may be exactly what the task asked for and the application still not come up.
  | "smoke_failure"
  | "unknown";

export type BlockerRecoverability = "auto" | "agent" | "human" | "terminal";

export interface DiagnosticBlocker {
  readonly kind: BlockerKind;
  readonly signature: string;
  readonly recoverability: BlockerRecoverability;
  readonly evidence: readonly string[];
}

export interface SystemicBlockerRequest {
  readonly title: string;
  readonly evidence_summary: string;
  readonly scope_note: string;
  readonly severity: "critical";
}

export interface DiagnosticAutocorrectionDecision {
  readonly feature_id: string;
  readonly diagnosis_summary: string;
  readonly blocker: DiagnosticBlocker;
  readonly next_step: "correct_state" | "block_for_conversation" | "stop_with_diagnostic" | "file_blocking_fix";
  readonly next_step_reason: string;
  readonly interface_response: {
    readonly mode: "none" | "recovery_conversation" | "manual_review";
    readonly summary: string;
    readonly target_paths: readonly string[];
  };
  readonly systemic_blocker: SystemicBlockerRequest | null;
}
