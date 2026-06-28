import type {
  BlockerKind,
  BlockerRecoverability,
} from "../runtime/diagnosticAutocorrection.js";
import type {
  DevelopmentPolicyMode,
  ExpectedDeliverable,
  TaskContext,
  TaskDevelopmentPolicy,
  TaskQualityGates,
  TaskScope,
  TaskTrace,
} from "./workItem.js";
import type { PlannedTask } from "../planner/plannerContracts.js";

/**
 * Task execution and recovery contracts.
 *
 * This file groups the temporary artifacts that drive implementation, review,
 * correction, and doctor recovery.
 */
export interface StateCorrectionTarget {
  readonly feature_state_path: string;
  readonly project_state_path: string | null;
  readonly contract_reference: string;
  readonly detected_issue: string;
  readonly restored_lifecycle_state: string;
  readonly restored_active_task: string;
  readonly restored_active_correction_task: string;
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
  readonly state_target: StateCorrectionTarget;
  readonly context: TaskContext;
  readonly scope: TaskScope;
  readonly constraints: readonly string[];
  readonly development_policy: TaskDevelopmentPolicy;
  readonly quality_gates: TaskQualityGates;
  readonly acceptance_criteria: readonly string[];
  readonly expected_deliverables: readonly ["documentation"];
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
  readonly executor_role?: "doctor";
  readonly review_policy?: "no_review_loop";
}

export type DoctorRecoveryTaskMetadata = UnblockTaskMetadata;

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

export interface StoredTaskArtifact {
  readonly task: PlannedTask;
  readonly state_correction?: StateCorrectionTask;
  readonly doctor_recovery?: DoctorRecoveryTaskMetadata;
  readonly unblock?: UnblockTaskMetadata;
}
