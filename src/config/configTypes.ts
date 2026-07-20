import type { Result } from '../shared/result.js';
import type { SupportedPlatform } from '../platform/platformInfo.js';

export interface ConfigurationIssue {
  readonly field: string;
  readonly message: string;
  readonly line?: number;
}

export type ExecutionMode = 'interactive' | 'semi_automatic' | 'automatic';

export interface ExecutionSection {
  readonly mode: ExecutionMode;
  readonly task_generation: string;
  readonly repository_is_source_of_truth: boolean;
  readonly planner_uses_repository_state: boolean;
  readonly orchestrator_uses_ai: boolean;
  readonly runtime_contract: string;
  readonly feature_state_contract: string;
}

export interface RoleEntry {
  readonly enabled: boolean;
  readonly adapter: string;
}

export interface RolesSection {
  readonly planner: RoleEntry;
  readonly implementer: RoleEntry;
  readonly reviewer: RoleEntry;
}

export type GitReviewTarget = 'git_diff';
export type GitBranchPerTask = 'required' | 'optional' | 'disabled';
export type GitCommitAfterTask = 'automatic' | 'manual' | 'disabled';

export type DevelopmentPolicyDefault = 'test_guided' | 'implementation_first' | 'documentation_first' | 'strict_tdd';

export interface DevelopmentPolicySection {
  readonly default: DevelopmentPolicyDefault;
}

export type ReviewPolicyMode = 'required' | 'optional' | 'disabled';

export interface ReviewPolicySection {
  readonly mode: ReviewPolicyMode;
  readonly record_skipped_review: boolean;
}

export interface QualityGatesSection {
  readonly enabled: boolean;
  readonly required: readonly string[];
  readonly optional: readonly string[];
}

export interface LimitsSection {
  readonly max_tasks_per_run: number;
  readonly max_retries_per_task: number;
  readonly max_review_iterations: number;
  readonly max_recovery_iterations: number;
  readonly stop_on_quality_gate_failure: boolean;
  readonly stop_on_review_failure: boolean;
}

export interface GitPolicySection {
  readonly require_clean_worktree_before_task: boolean;
  readonly review_target: GitReviewTarget;
  readonly allow_dirty_worktree: boolean;
  readonly branch_per_task: GitBranchPerTask;
  readonly commit_after_task: GitCommitAfterTask;
}

export interface ProjectSection {
  readonly name: string;
  readonly supported_platforms: SupportedPlatform[];
  readonly documentation_root: string;
  readonly [key: string]: unknown;
}

export interface ExternalCliAdapterSection {
  readonly type: 'external_cli';
  readonly command?: string;
  readonly args?: readonly string[];
  readonly stdin?: boolean;
  readonly input_file_argument?: string;
  readonly output_file?: string;
  readonly [key: string]: unknown;
}

export interface AdaptersSection {
  readonly external_cli: ExternalCliAdapterSection;
  readonly [key: string]: unknown;
}

export interface CommandsSection {
  readonly typecheck: string;
  readonly tests: string;
  readonly lint: string;
  readonly build: string;
  readonly [key: string]: string;
}

export interface DocumentationSection {
  readonly roadmap: string;
  readonly project_state: string;
  readonly config: string;
  readonly contracts_root: string;
  readonly [key: string]: unknown;
}

export interface ProjectConfiguration {
  readonly project: ProjectSection;
  readonly adapters: AdaptersSection;
  readonly commands: CommandsSection;
  readonly documentation: DocumentationSection;
  readonly execution?: ExecutionSection;
  readonly roles?: RolesSection;
  readonly git_policy: GitPolicySection;
  readonly development_policy?: DevelopmentPolicySection;
  readonly review_policy?: ReviewPolicySection;
  readonly quality_gates?: QualityGatesSection;
  readonly limits?: LimitsSection;
  readonly [key: string]: unknown;
}

export type ProjectConfigurationLoadResult = Result<ProjectConfiguration, ConfigurationIssue[]>;
