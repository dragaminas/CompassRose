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

/**
 * What "the application runs" means for this project (029-runnable-application-gate).
 *
 * The configured quality gates -- typecheck, tests, lint, build -- all pass happily on an
 * application that does not start. This is the declaration that makes starting checkable, and it is
 * declared rather than inferred so the definition of "done" never becomes model judgment.
 *
 * `expect` may carry any combination of its fields; all present conditions must hold. Whether the
 * command is expected to exit is decided by the presence of `http_ok`, not by guessing at the kind
 * of project.
 */
export interface SmokeExpectSection {
  readonly exit_code?: number;
  readonly stdout_contains?: string;
  readonly http_ok?: string;
}

export interface SmokeSection {
  readonly command?: string;
  readonly expect?: SmokeExpectSection;
  readonly timeout_seconds?: number;
  /**
   * Opting out, with a mandatory reason. The reason requirement matches the discipline applied to
   * discarded dimensions in 024-specification-flow: six months later, the document has to
   * distinguish "genuinely has no entry point" from "nobody got round to it".
   */
  readonly none?: string;
}

export interface LimitsSection {
  readonly max_tasks_per_run: number;
  readonly max_retries_per_task: number;
  readonly max_review_iterations: number;
  readonly stop_on_quality_gate_failure: boolean;
  readonly stop_on_review_failure: boolean;
  /**
   * Optional, unlike every field above: omitting it means unbounded, so an existing project config
   * that predates this field is completely unaffected. Unlike max_tasks_per_run (which only counts
   * primary task completions), this bounds every structured AI call in a `--loop` run -- planning,
   * review, classification ensembles, all of it -- checked centrally once per step rather than at
   * each call site. See ADR-0041.
   */
  readonly max_ai_calls_per_run?: number;
  /**
   * Characters an agent call may be given, checked against the task's declared context manifest
   * at planning time (027-bounded-work-item-context). Optional, and absence means unbounded --
   * an existing config that predates the field is completely unaffected, matching ADR-0040.
   *
   * Characters rather than tokens: token counts differ per provider and would need a tokenizer
   * dependency this project does not have. Calibrate the value against character counts.
   */
  readonly context_budget_characters?: number;
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
  /**
   * Optional; defaults to 'compassrose' (src/config/compassRosePaths.ts's
   * DEFAULT_COMPASSROSE_ROOT) when omitted. Documents where CompassRose's own operational
   * docs (CONFIG.md, PROJECT_STATE.md, ADR.md, SAD.md, ROADMAP.md, DMS.md, features/, fixes/,
   * templates/) live -- isolated from the target repository's own docs/ tree. This field is
   * read back for a self-consistency check only (it can't redirect the bootstrap lookup,
   * which must find CONFIG.md before any config value can be read at all).
   */
  readonly compassrose_root?: string;
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
  readonly smoke?: SmokeSection;
  readonly limits?: LimitsSection;
  readonly [key: string]: unknown;
}

export type ProjectConfigurationLoadResult = Result<ProjectConfiguration, ConfigurationIssue[]>;
