import type { AgentToolName } from '../contracts/runtime/agentContext.js';

export function logAgentStart(agent: AgentToolName, label: string, command: string): void {
  console.log(`[${agent}:${label}] start ${command}`);
}

export function logAgentStream(agent: AgentToolName, label: string, stream: 'stdout' | 'stderr', text: string): void {
  const trimmed = text.trimEnd();
  if (trimmed.length === 0) {
    return;
  }

  const prefix = `[${agent}:${label}] ${stream} | `;
  const rendered = trimmed
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');

  if (stream === 'stderr') {
    process.stderr.write(`${rendered}\n`);
    return;
  }

  process.stdout.write(`${rendered}\n`);
}

export function logAgentEnd(
  agent: AgentToolName,
  label: string,
  elapsedMs: number,
  exitCode: number | null,
  errorMessage: string | null,
): void {
  const status = exitCode === 0 ? 'ok' : `exit ${exitCode ?? 'null'}`;
  const errorSuffix = errorMessage ? `, error: ${errorMessage}` : '';
  console.log(`[${agent}:${label}] done (${status}${errorSuffix}) in ${elapsedMs}ms`);
}
