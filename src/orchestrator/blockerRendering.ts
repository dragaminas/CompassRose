import type { BlockerKind, BlockerRecoverability } from '../contracts/runtime/diagnosticAutocorrection.js';
import type { BlockerProfile, RestorationTarget } from '../contracts/task/taskContracts.js';
import { stripTicks } from '../markdown/sections.js';

export function isBlockerKind(value: string): value is BlockerKind {
  return value === 'state_corruption'
    || value === 'task_interface_gap'
    || value === 'cli_mismatch'
    || value === 'environment'
    || value === 'implementation_failure'
    || value === 'smoke_failure'
    || value === 'review_failure'
    || value === 'unknown';
}

export function isBlockerRecoverability(value: string): value is BlockerRecoverability {
  return value === 'auto' || value === 'agent' || value === 'human' || value === 'terminal';
}

export function readValueFromStructuredLines(lines: readonly string[], key: string): string | null {
  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized.toLowerCase().startsWith(`${key.toLowerCase()}:`)) {
      continue;
    }

    const value = normalized.slice(key.length + 1).trim();
    return value.length > 0 ? stripTicks(value) : null;
  }

  return null;
}

export function renderBlockerProfileMarkdown(profile: {
  readonly run_id: string;
  readonly feature_id: string;
  readonly task_id: string | null;
  readonly reason: string;
  readonly blocker: BlockerProfile;
  readonly restoration_target: RestorationTarget;
}): string {
  return [
    `# Blocker Profile: ${profile.feature_id}`,
    '',
    `- run_id: \`${profile.run_id}\``,
    `- task_id: \`${profile.task_id ?? 'none'}\``,
    `- reason: ${profile.reason}`,
    '',
    '## Blocker',
    `- kind: ${profile.blocker.kind}`,
    `- signature: ${profile.blocker.signature}`,
    `- recoverability: ${profile.blocker.recoverability}`,
    `- observed_state: ${profile.blocker.observed_state}`,
    ...(profile.blocker.evidence.length > 0 ? profile.blocker.evidence.map((item) => `- evidence: ${item}`) : ['- evidence: none']),
    '',
    '## Restoration Target',
    `- lifecycle_state: ${profile.restoration_target.lifecycle_state}`,
    `- active_task: \`${profile.restoration_target.active_task}\``,
    `- active_correction_task: \`${profile.restoration_target.active_correction_task}\``,
    '',
  ].join('\n');
}
