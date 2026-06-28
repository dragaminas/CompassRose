/**
 * Shared adapter envelope types.
 *
 * These shapes are reused by the planner, reviewer, and implementer adapter
 * contracts.
 */
export interface AdapterRoleConfig {
  readonly adapter: string;
  readonly provider: string;
  readonly model: string;
  readonly command: string | null;
  readonly endpoint: string | null;
  readonly timeout_seconds: number;
}

export interface AdapterWorkspace {
  readonly repository_root: string;
  readonly branch: string;
}

export type AdapterInvocationStatus = "success" | "failed";
