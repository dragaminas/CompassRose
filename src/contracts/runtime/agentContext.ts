import type { ProjectConfiguration } from "../../config/configTypes.js";

/**
 * Logged context sent to an external agent.
 *
 * Each invocation stores the exact prompt plus the configuration and workspace
 * snapshot that produced it, so failures can be debugged from the concrete
 * context that was actually sent.
 */
export type AgentRole = "planner" | "reviewer" | "implementer" | "doctor" | "diagnostic" | "classifier" | "validator" | "brainstormer";
/** Shared agent/tool names used by runtime options and invocation logs. */
export type AgentToolName = "codex" | "opencode";

export type AgentInvocationKind =
  | "feature_planning"
  | "task_planning"
  | "subtask_execution"
  | "subtask_review"
  | "diagnostic_autocorrection"
  | "review_task"
  | "task_interface_analysis"
  | "implement_task"
  | "blocker_kind_classification"
  | "systemic_blocker_next_step"
  | "feature_validation_weight"
  | "feature_validation_decision_points"
  | "brainstorm_turn"
  | "acceptance_criteria_verification"
  | "recovery_diagnosis";

export interface AgentToolContext {
  readonly name: AgentToolName;
  readonly command: string;
  readonly model: string | null;
  readonly output_schema_id: string | null;
}

export interface AgentWorkspaceContext {
  readonly repository_root: string;
  readonly head_commit: string | null;
  readonly dirty_paths: readonly string[];
}

export interface AgentConfigurationContext {
  readonly configuration_path: string;
  readonly project_state_path: string;
  readonly features_root: string;
  readonly project_configuration: ProjectConfiguration;
  readonly runtime_options: {
    readonly loop: boolean;
    readonly commit: boolean;
    readonly implementer: AgentToolName;
  };
  readonly model_overrides: {
    readonly codex_model: string | null;
    readonly codex_planner_model: string | null;
    readonly codex_implementer_model: string | null;
    readonly opencode_model: string | null;
  };
}

export interface AgentInvocationContext {
  readonly run_id: string;
  readonly recorded_at: string;
  readonly role: AgentRole;
  readonly kind: AgentInvocationKind;
  readonly label: string;
  readonly feature_id: string | null;
  readonly task_id: string | null;
  readonly source_paths: readonly string[];
  readonly prompt: string;
  readonly tool: AgentToolContext;
  readonly configuration: AgentConfigurationContext;
  readonly workspace: AgentWorkspaceContext;
}

/**
 * Selects the implementer context artifact names for a task from a list of
 * `logs/agent-contexts/<run_id>/` file names.
 *
 * The reviewer uses these paths to inspect the exact prompt and runtime
 * snapshot that the implementer received.
 */
export function selectImplementationContextArtifactNames(
  artifactNames: readonly string[],
  taskId: string,
): readonly string[] {
  const taskToken = slugifyForArtifactLookup(taskId);

  return artifactNames
    .filter((name) =>
      (name.endsWith('.json') || name.endsWith('.prompt.txt')) &&
      name.includes('subtask-execution-implementer-') &&
      name.includes(taskToken))
    .sort((left, right) => left.localeCompare(right));
}

function slugifyForArtifactLookup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
