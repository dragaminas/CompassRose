import { spawnSync } from 'node:child_process';
import type { AgentToolName } from '../contracts/runtime/agentContext.js';
import { installationAssetPath } from '../config/installationPaths.js';

export const DEFAULT_AGENT_HEARTBEAT_MS = 15_000;
// Addressed from the installation's `src/`, not from next to this module: `tsc` emits no `.mjs`,
// so the sibling this used to resolve to does not exist in `dist/`. Every agent call went through
// it, so from a built installation every agent call failed with MODULE_NOT_FOUND -- found the
// first time CompassRose was run from `dist` against another repository (ADR-0049).
export const HEARTBEAT_RUNNER_PATH = installationAssetPath('src/agents/heartbeatRunner.mjs');

export interface HeartbeatRunConfig {
  readonly agent: AgentToolName;
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly promptPath: string;
  readonly promptMode: 'stdin' | 'arg';
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly heartbeatIntervalMs: number;
}

export function runCommandWithHeartbeat(
  config: HeartbeatRunConfig,
): { status: number | null; signal: string | null; error: Error | undefined } {
  const result = spawnSync(process.execPath, [HEARTBEAT_RUNNER_PATH], {
    cwd: config.cwd,
    env: {
      ...process.env,
      PROTO_COMPASSROSE_HEARTBEAT_CONFIG: JSON.stringify(config),
    },
    stdio: 'inherit',
  });

  return {
    status: result.status,
    signal: result.signal,
    error: result.error,
  };
}
