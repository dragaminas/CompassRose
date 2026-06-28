import type { AgentToolName } from "./agentContext.js";
import type { FeatureStateSnapshot } from "../state/featureStateSnapshot.js";
import type { StepDecision } from "./stepDecision.js";

/**
 * Runtime contracts shared by `proto/protoCompassRose.ts`.
 *
 * These shapes capture the small set of records that are important enough to
 * live in the contract layer instead of being duplicated inside proto.
 */
export interface ProtoOptions {
  readonly loop: boolean;
  readonly commit: boolean;
  readonly cwd: string;
  readonly implementer: AgentToolName;
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
 * Runtime classification of how a feature should be handled next.
 */
export interface FeatureInspection {
  readonly kind:
    | 'request_pending'
    | 'formalization_pending'
    | 'formalized'
    | 'task_planning_pending'
    | 'task_ready'
    | 'unblock_pending'
    | 'implementation_running'
    | 'quality_gates_pending'
    | 'review_pending'
    | 'correction_pending'
    | 'implementation_failed'
    | 'quality_failed'
    | 'review_failed'
    | 'blocked'
    | 'completed'
    | 'malformed';
  readonly reason: string;
  readonly snapshot: FeatureStateSnapshot | null;
}

/**
 * Result of executing a single selected runtime step.
 */
export interface StepExecutionResult {
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
