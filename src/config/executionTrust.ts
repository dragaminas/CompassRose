import type { AgentNetwork, AgentSandbox, ExecutionTrustSection, ProjectConfiguration } from './configTypes.js';

/**
 * The execution-trust policy in force for a run (030-execution-trust).
 *
 * CompassRose spawns three quite different kinds of process, and only two of them are its own:
 * git plumbing (argv-form, fixed verbs), quality-gate commands (shell strings, authored by the
 * planner), and an external agent CLI (which then runs whatever it likes). This policy is what the
 * last two are checked against.
 *
 * CompassRose cannot itself confine codex or opencode -- that is the CLI's own sandbox to enforce,
 * and on some platforms it enforces less than on others. What CompassRose controls is whether it
 * *asks* for the sandbox or waives it, and until now it waived it on every single call.
 */
export type ExecutionTrustPolicy = ExecutionTrustSection;

/**
 * Prefixes permitted when a project declares no list of its own.
 *
 * Deliberately short. This is the set of things a quality gate legitimately is -- run a script,
 * typecheck, test, diff -- and anything a project genuinely needs beyond it is one line in
 * CONFIG.md. A generous default would make the allowlist decorative, which is the failure mode
 * this whole section exists to avoid.
 */
export const DEFAULT_GATE_COMMAND_ALLOWLIST: readonly string[] = [
  'npm run',
  'npm test',
  'npm exec',
  'npx',
  'pnpm run',
  'pnpm test',
  'yarn run',
  'yarn test',
  'bun run',
  'bun test',
  'git diff',
  'git status',
  'cargo',
  'go test',
  'go build',
  'make',
  'mvn',
  'gradle',
  'pytest',
  'python -m',
  'dotnet',
];

/**
 * What a project gets when it has never declared anything.
 *
 * `workspace-write` rather than `read-only`: the implementer's entire job is to write code, and a
 * default that cannot do the job would be abandoned rather than tightened. `denied` network rather
 * than allowed: a task that needs to reach the internet should have to say so, and a denied network
 * call fails legibly where an unnoticed one does not.
 */
export const DEFAULT_EXECUTION_TRUST: ExecutionTrustPolicy = {
  agent_sandbox: 'workspace-write',
  agent_network: 'denied',
  gate_command_allowlist: DEFAULT_GATE_COMMAND_ALLOWLIST,
};

export const AGENT_SANDBOXES: readonly AgentSandbox[] = ['read-only', 'workspace-write', 'danger-full-access'];
export const AGENT_NETWORKS: readonly AgentNetwork[] = ['denied', 'allowed'];

/**
 * The policy for this repository, field by field.
 *
 * Resolved per field rather than all-or-nothing, so a project that declares only
 * `gate_command_allowlist` still gets the bounded sandbox default instead of silently opting out of
 * everything it did not mention.
 */
export function resolveExecutionTrust(configuration: ProjectConfiguration | null): ExecutionTrustPolicy {
  const declared = configuration?.execution_trust;
  if (!declared) {
    return DEFAULT_EXECUTION_TRUST;
  }

  return {
    agent_sandbox: declared.agent_sandbox ?? DEFAULT_EXECUTION_TRUST.agent_sandbox,
    agent_network: declared.agent_network ?? DEFAULT_EXECUTION_TRUST.agent_network,
    gate_command_allowlist: declared.gate_command_allowlist?.length
      ? declared.gate_command_allowlist
      : DEFAULT_EXECUTION_TRUST.gate_command_allowlist,
  };
}

/**
 * One line, for the run header and for a blocker's evidence.
 *
 * An execution policy nobody can see is the same as no execution policy, and this is a system whose
 * whole claim is that what bounds a run is legible.
 */
export function describeExecutionTrust(policy: ExecutionTrustPolicy): string {
  return `sandbox ${policy.agent_sandbox}, network ${policy.agent_network}, `
    + `${policy.gate_command_allowlist.length} allowed gate prefixes`;
}
