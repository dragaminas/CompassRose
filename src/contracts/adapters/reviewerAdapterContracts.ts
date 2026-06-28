import type { ReviewerInput, ReviewerOutput } from "../reviewer/reviewerContracts.js";
import type { AdapterInvocationStatus, AdapterRoleConfig } from "./adapterShared.js";

/**
 * Reviewer adapter contract.
 *
 * This role-specific contract describes the reviewer envelope only.
 */
export interface ReviewerAdapterInput {
  readonly reviewer_input: ReviewerInput;
  readonly role_config: AdapterRoleConfig;
}

export interface ReviewerAdapterOutput {
  readonly status: AdapterInvocationStatus;
  readonly reviewer_output: ReviewerOutput | null;
  readonly raw_output: string;
  readonly error: string | null;
}
