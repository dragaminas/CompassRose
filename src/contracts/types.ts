export type StepKind =
  | 'plan_feature'
  | 'plan_task'
  | 'correct_state'
  | 'doctor_recovery_task'
  | 'unblock_task'
  | 'diagnose_autocorrect'
  | 'implement_task'
  | 'review_task'
  | 'correct_task'
  | 'stop'
  | 'blocked';

export type DevelopmentPolicyMode =
  | 'test_guided'
  | 'implementation_first'
  | 'documentation_first'
  | 'strict_tdd';

export type ReviewerStatus = 'approved' | 'changes_required' | 'blocked' | 'failed';

export type DiagnosticClassification =
  | 'context_overflow'
  | 'provider_failure'
  | 'permission_prompt'
  | 'reviewable_diff_lost'
  | 'tool_refusal'
  | 'missing_implementation_notes'
  | 'model_passivity'
  | 'ui_cli_behavior'
  | 'unknown';

export type BlockerKind =
  | 'state_corruption'
  | 'task_interface_gap'
  | 'cli_mismatch'
  | 'environment'
  | 'implementation_failure'
  | 'review_failure'
  | 'unknown';

export type BlockerRecoverability = 'auto' | 'agent' | 'human' | 'terminal';

export type ExpectedDeliverable = 'code' | 'tests' | 'documentation';

export interface StepDecision {
  readonly kind: StepKind;
  readonly feature_id: string | null;
  readonly task_id: string | null;
  readonly correction_task_id: string | null;
  readonly reason: string;
}

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

export interface PlannedFeatureDocs {
  readonly feature_id: string;
  readonly feature_md: string;
  readonly architecture_md: string;
  readonly state_md: string;
  readonly summary: string;
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

export interface CorrectionTask {
  readonly parent_task_id: string;
  readonly correction_task_id: string;
  readonly feature_id: string;
  readonly title: string;
  readonly objective: string;
  readonly first_executable_step: string;
  readonly minimum_progress_evidence: readonly string[];
  readonly review_findings: readonly string[];
  readonly scope: TaskScope;
  readonly constraints: readonly string[];
  readonly acceptance_criteria: readonly string[];
  readonly quality_gates: TaskQualityGates;
}

export interface StateCorrectionTask {
  readonly task_id: string;
  readonly feature_id: string;
  readonly title: string;
  readonly objective: string;
  readonly first_executable_step: string;
  readonly minimum_progress_evidence: readonly string[];
  readonly trace: TaskTrace;
  readonly state_target: {
    readonly feature_state_path: string;
    readonly project_state_path: string | null;
    readonly contract_reference: string;
    readonly detected_issue: string;
    readonly restored_lifecycle_state: string;
    readonly restored_active_task: string;
    readonly restored_active_correction_task: string;
  };
  readonly context: TaskContext;
  readonly scope: TaskScope;
  readonly constraints: readonly string[];
  readonly development_policy: TaskDevelopmentPolicy;
  readonly quality_gates: TaskQualityGates;
  readonly acceptance_criteria: readonly string[];
  readonly expected_deliverables: readonly ['documentation'];
}

export interface RestorationTarget {
  readonly lifecycle_state: string;
  readonly active_task: string;
  readonly active_correction_task: string;
  readonly active_unblock_task: string;
}

export interface BlockerProfile {
  readonly kind: BlockerKind;
  readonly signature: string;
  readonly evidence: readonly string[];
  readonly recoverability: BlockerRecoverability;
  readonly observed_state: string;
}

export interface UnblockTaskMetadata {
  readonly blocker: BlockerProfile;
  readonly restoration_target: RestorationTarget;
  readonly executor_role?: 'doctor';
  readonly review_policy?: 'no_review_loop';
}

export type DoctorRecoveryTaskMetadata = UnblockTaskMetadata;

export interface StoredTaskArtifact {
  readonly task: PlannedTask;
  readonly state_correction?: StateCorrectionTask;
  readonly doctor_recovery?: DoctorRecoveryTaskMetadata;
  readonly unblock?: UnblockTaskMetadata;
}

export interface ReviewerAcceptanceCriterion {
  readonly criterion: string;
  readonly status: 'passed' | 'failed' | 'not_verified';
  readonly notes: string;
}

export interface ReviewerFinding {
  readonly severity: 'info' | 'warning' | 'error' | 'blocker';
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
    readonly status: 'passed' | 'failed';
    readonly unrelated_changes: readonly string[];
  };
  readonly quality_gate_check: {
    readonly status: 'passed' | 'failed' | 'skipped';
    readonly failed_gates: readonly string[];
  };
  readonly correction_task: CorrectionTask | null;
  readonly project_state_update_hint: string | null;
}

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
  readonly recommended_action: 'tighten_task_interface' | 'document_implementer_limitation' | 'both' | 'none';
  readonly perfectible: boolean;
  readonly implementer_limitations: readonly string[];
  readonly task_interface_adjustments: TaskInterfaceAdjustments;
  readonly notes_for_documentation: readonly string[];
}

export interface DiagnosticAutocorrectionDecision {
  readonly feature_id: string;
  readonly diagnosis_summary: string;
  readonly blocker: {
    readonly kind: BlockerKind;
    readonly signature: string;
    readonly recoverability: BlockerRecoverability;
    readonly evidence: readonly string[];
  };
  readonly next_step: 'correct_state' | 'plan_doctor_recovery' | 'stop_with_diagnostic';
  readonly next_step_reason: string;
  readonly interface_response: {
    readonly mode: 'none' | 'apply_in_doctor_recovery' | 'manual_review';
    readonly summary: string;
    readonly target_paths: readonly string[];
  };
}

export interface RecoveryLesson {
  readonly run_id: string;
  readonly created_at: string;
  readonly feature_id: string;
  readonly task_id: string;
  readonly correction_task_id: string | null;
  readonly review_status: ReviewerStatus;
  readonly summary: string;
  readonly implementation_notes: string | null;
  readonly review_findings: readonly string[];
  readonly quality_gate_failures: readonly string[];
  readonly recommended_action: TaskInterfaceAnalysis['recommended_action'];
  readonly perfectible: boolean;
  readonly scope_isolation_notes: readonly string[];
  readonly implementer_limitations: readonly string[];
  readonly task_interface_adjustments: TaskInterfaceAnalysis['task_interface_adjustments'];
  readonly notes_for_documentation: readonly string[];
}

export interface ReviewableDiffHandoff {
  readonly requireLiveDiff: boolean;
  readonly allowGitCommitBeforeHandoff: boolean;
  readonly requiredChangedFiles: readonly string[];
}

export interface ParsedTaskDocument {
  readonly taskId: string;
  readonly previousTaskId: string | null;
  readonly featureId: string;
  readonly title: string;
  readonly objective: string;
  readonly firstExecutableStep: string;
  readonly minimumProgressEvidence: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly qualityGates: readonly string[];
  readonly developmentPolicy: DevelopmentPolicyMode;
  readonly likelyAffectedFiles: readonly string[];
  readonly trace: TaskTrace;
  readonly context: TaskContext;
  readonly expectedDeliverables: readonly ExpectedDeliverable[];
  readonly stateCorrection: StateCorrectionTask | null;
  readonly doctorRecovery: DoctorRecoveryTaskMetadata | null;
  readonly unblock: UnblockTaskMetadata | null;
  readonly reviewableDiffHandoff: ReviewableDiffHandoff;
  readonly path: string;
}

export interface FeatureStateSnapshot {
  readonly lifecycleState: string;
  readonly activeTask: string;
  readonly activeCorrectionTask: string;
  readonly activeUnblockTask: string;
  readonly blockedBy: readonly string[];
  readonly blockedFrom: RestorationTarget | null;
}

export interface QualityGateResult {
  readonly name: string;
  readonly command: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly output_summary: string;
}

export interface ImplementationDiagnostics {
  readonly classification: DiagnosticClassification;
  readonly evidence: readonly string[];
  readonly first_executable_step_status: 'attempted' | 'not_attempted' | 'unknown';
  readonly minimum_progress_evidence_status: 'present' | 'absent' | 'unknown';
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly timed_out: boolean;
  readonly command_invoked: string | null;
}

export interface ImplementationAttempt {
  readonly status: 'success' | 'failed';
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
