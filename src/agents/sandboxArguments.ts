import type { ExecutionTrustPolicy } from '../config/executionTrust.js';

/**
 * The sandbox flags an agent CLI invocation carries (030-execution-trust).
 *
 * Kept as a pure function rather than inlined into the adapters so the argv can be asserted without
 * spawning anything. What flags a process is launched with is not something a type checker can
 * prove, and until now the answer -- on every single call CompassRose made -- was
 * `--dangerously-bypass-approvals-and-sandbox`, whose own help text reads "Intended solely for
 * running in environments that are externally sandboxed". CompassRose runs in the user's own
 * repository on the user's own machine. There is no external sandbox.
 *
 * What CompassRose can and cannot do here is worth being exact about: it cannot confine codex. The
 * confinement is codex's own, and how much it is worth differs by platform. What CompassRose
 * controls is whether it *asks* for that confinement or waives it, and it was waiving it.
 */

/**
 * Why a call is being made, which decides how much it is allowed to do.
 *
 * `read-only` covers planning, diagnosis, review, classification and inference: everything that
 * returns a structured answer. None of those have any business writing to the repository, and the
 * planner path already declared `-s read-only` -- and then cancelled it with the bypass flag two
 * arguments later.
 */
export type AgentCallKind = 'structured' | 'implementation';

export function codexSandboxArguments(policy: ExecutionTrustPolicy, kind: AgentCallKind): readonly string[] {
  const sandbox = kind === 'structured' ? 'read-only' : policy.agent_sandbox;
  const args = ['-s', sandbox];

  // Only meaningful under workspace-write: read-only has no network of its own to grant, and
  // danger-full-access is the project having explicitly asked for no boundary at all. Passed
  // explicitly rather than relying on the CLI's default so the user's own global config cannot
  // quietly widen it -- which is the same class of surprise this whole section is about.
  if (sandbox === 'workspace-write') {
    args.push('-c', `sandbox_workspace_write.network_access=${policy.agent_network === 'allowed'}`);
  }

  return args;
}

/**
 * One line for the invocation record, so a run's execution posture is recoverable afterwards.
 *
 * A blocked write six months from now should be answerable from the artifact store rather than by
 * re-deriving what the config said at the time.
 */
export function describeAgentSandbox(policy: ExecutionTrustPolicy, kind: AgentCallKind): string {
  const sandbox = kind === 'structured' ? 'read-only' : policy.agent_sandbox;
  return sandbox === 'workspace-write'
    ? `${sandbox} (network ${policy.agent_network})`
    : sandbox;
}
