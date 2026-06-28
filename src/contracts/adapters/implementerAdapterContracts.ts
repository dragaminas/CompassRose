import type { ImplementationAttempt } from "../runtime/attempts.js";
import type { ParsedTaskDocument } from "../task/taskContracts.js";
import type { AdapterRoleConfig, AdapterWorkspace } from "./adapterShared.js";

/**
 * Implementer adapter contract.
 *
 * This role-specific contract describes the implementer envelope only.
 */
export interface ImplementerAdapterInput {
  readonly task: ParsedTaskDocument;
  readonly role_config: AdapterRoleConfig;
  readonly workspace: AdapterWorkspace;
}

export type ImplementerAdapterOutput = ImplementationAttempt;
