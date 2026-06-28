import type { PlannerInput, PlannerOutput } from "../planner/plannerContracts.js";
import type { AdapterInvocationStatus, AdapterRoleConfig } from "./adapterShared.js";

/**
 * Planner adapter contract.
 *
 * This role-specific contract describes the planner envelope only.
 */
export interface PlannerAdapterInput {
  readonly planner_input: PlannerInput;
  readonly role_config: AdapterRoleConfig;
}

export interface PlannerAdapterOutput {
  readonly status: AdapterInvocationStatus;
  readonly planner_output: PlannerOutput | null;
  readonly raw_output: string;
  readonly error: string | null;
}
