import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AgentToolName } from '../contracts/runtime/agentContext.js';

export const DEFAULT_AGENT_HEARTBEAT_MS = 15_000;
export const HEARTBEAT_RUNNER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'heartbeatRunner.mjs');

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
