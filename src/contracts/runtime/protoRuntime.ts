import type { AgentToolName } from "./agentContext.js";
import type { FeatureStateSnapshot } from "../state/featureStateSnapshot.js";
import type { StepDecision } from "./stepDecision.js";
import type { FixSeverity } from "../planner/plannerContracts.js";

/**
 * Runtime contracts shared by `src/orchestrator/orchestrator.ts` and `src/cli/main.ts`.
 *
 * These shapes capture the small set of records that are important enough to
 * live in the contract layer instead of being duplicated inside the orchestrator.
 */
export interface ProtoOptions {
  readonly loop: boolean;
  readonly commit: boolean;
  readonly cwd: string;
  readonly implementer: AgentToolName;
  /**
   * Restrict the run to one work item (025-automated-development-loop). Narrows selection and never
   * widens it: a target cannot make the loop work on something the gates would otherwise refuse.
   */
  readonly target?: string | null;
}

/**
 * Lightweight inventory record for a feature folder.
 */
export interface FeatureRecord {
  readonly id: string;
  readonly name: string;
  readonly directory: string;
  readonly requestPath: string;
  readonly featurePath: string;
  readonly architecturePath: string;
  readonly statePath: string;
  readonly tasksDirectory: string;
}

/**
 * Unified view of "whatever owns this task" — a feature or a fix — used by the generic
 * execution machinery (implementation, review, blockers) so it doesn't need
 * to branch on which kind of work item it's handling. `architecturePath` is null for fixes,
 * since a fix has no architecture.md.
 */
export interface WorkItemContext {
  readonly id: string;
  readonly directory: string;
  readonly requestPath: string;
  readonly definitionPath: string;
  readonly architecturePath: string | null;
  readonly statePath: string;
  readonly tasksDirectory: string;
}

/**
 * Lightweight inventory record for a fix-request folder (see compassrose/fixes/README.md).
 * A fix has no architecture.md, unlike a feature.
 */
export interface FixRecord {
  readonly id: string;
  readonly name: string;
  readonly directory: string;
  readonly requestPath: string;
  readonly fixPath: string;
  readonly statePath: string;
  readonly tasksDirectory: string;
}

/**
 * The lifecycle-state-driven classification shared by both features and fixes —
 * the state graph in src/contracts/state/feature-state.md is container-agnostic.
 */
export type WorkItemInspectionKind =
  | 'request_pending'
  | 'formalization_pending'
  | 'formalized'
  // Formalized (feature.md/architecture.md exist) but not yet confirmed by a human through
  // "npm run feature-validation" (see ADR-0046/Flow 1) -- invisible to both scheduler passes,
  // same treatment as 'blocked_on_fix', so plan_task/plan_fix_task is never selected for it.
  | 'awaiting_validation'
  | 'task_planning_pending'
  | 'task_ready'
  | 'implementation_running'
  | 'quality_gates_pending'
  | 'review_pending'
  | 'correction_pending'
  | 'implementation_failed'
  | 'quality_failed'
  | 'review_failed'
  | 'blocked'
  | 'blocked_on_fix'
  // A 'blocked' feature/fix whose recorded BlockerProfile.recoverability is 'human' or
  // 'terminal' -- the runtime has already concluded no further automatic action can help, so
  // (like 'blocked_on_fix'/'awaiting_validation') it is invisible to both scheduler passes until
  // a human explicitly clears it via acknowledgeBlocker(). Without this, the scheduler kept
  // re-diagnosing an already-exhausted blocker every run, spending an ensemble call only to
  // re-trip the same limit and re-print the same card each time.
  | 'blocked_on_human'
  | 'completed'
  | 'malformed';

/**
 * Runtime classification of how a feature should be handled next.
 */
export interface FeatureInspection {
  readonly kind: WorkItemInspectionKind;
  readonly reason: string;
  readonly snapshot: FeatureStateSnapshot | null;
}

/**
 * Runtime classification of how a fix should be handled next, plus the severity/ownership
 * read from its state.md's Operational Status so the scheduler doesn't need to re-parse
 * fix.md prose on every tick.
 */
export interface FixInspection {
  readonly kind: WorkItemInspectionKind;
  readonly reason: string;
  readonly snapshot: FeatureStateSnapshot | null;
  readonly severity: FixSeverity;
  readonly owningFeature: string | null;
}

/**
 * Result of executing a single selected runtime step.
 */
/**
 * What a step actually meant, as opposed to what number it returned (025-automated-development-loop).
 *
 * `run()` used to treat any non-zero exit code as fatal, which conflated two completely different
 * things: "this work item cannot proceed" and "the engine is broken". That conflation is why a
 * single blocked feature parked the nineteen behind it for weeks.
 *
 * - `advanced` -- the step did its work; carry on
 * - `blocked`  -- this work item cannot proceed and needs a human; set it aside and carry on
 * - `failed`   -- the runtime itself is in no state to continue; stop the run
 *
 * `failed` is deliberately narrow: an unhandled exception, a contract or schema validation failure
 * in the runtime's own artifacts, a dirty worktree where policy requires a clean one, a failing git
 * operation, a declared run limit reached, or an adapter that cannot be invoked at all. Everything
 * else that ends with a work item unable to proceed is `blocked`.
 */
export type StepOutcomeKind = 'advanced' | 'blocked' | 'failed';

export interface StepExecutionResult {
  readonly kind: StepOutcomeKind;
  readonly exitCode: number;
  readonly continueLoop: boolean;
  readonly summary: string;
}

/**
 * Persisted record of one runtime decision and its result.
 */
export interface StepRunRecord {
  readonly decided_at: string;
  readonly decision: StepDecision;
  readonly exit_code: number;
  readonly continue_loop: boolean;
  readonly summary: string;
}

/**
 * Summary artifact written after a proto run finishes.
 */
export interface RunSummary {
  readonly run_id: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly status: 'completed' | 'stopped' | 'failed';
  readonly exit_code: number;
  readonly options: ProtoOptions;
  readonly steps: readonly StepRunRecord[];
  readonly error: string | null;
}

/**
 * Result of reloading contract schemas and checking whether proto must restart.
 */
export interface ContractRefreshResult {
  readonly reloadedSchemas: readonly string[];
  readonly restartRequired: boolean;
  readonly restartReasons: readonly string[];
}
