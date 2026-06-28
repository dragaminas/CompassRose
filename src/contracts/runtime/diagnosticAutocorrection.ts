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
  | "unknown";

export type BlockerRecoverability = "auto" | "agent" | "human" | "terminal";

export interface DiagnosticBlocker {
  readonly kind: BlockerKind;
  readonly signature: string;
  readonly recoverability: BlockerRecoverability;
  readonly evidence: readonly string[];
}

export interface DiagnosticAutocorrectionDecision {
  readonly feature_id: string;
  readonly diagnosis_summary: string;
  readonly blocker: DiagnosticBlocker;
  readonly next_step: "correct_state" | "plan_doctor_recovery" | "stop_with_diagnostic";
  readonly next_step_reason: string;
  readonly interface_response: {
    readonly mode: "none" | "apply_in_doctor_recovery" | "manual_review";
    readonly summary: string;
    readonly target_paths: readonly string[];
  };
}
