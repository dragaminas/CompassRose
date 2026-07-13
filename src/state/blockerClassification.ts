import type { BlockerKind, BlockerRecoverability } from '../contracts/runtime/diagnosticAutocorrection.js';
import type { BlockerProfile } from '../contracts/task/taskContracts.js';
import { uniqueStrings } from '../shared/arrays.js';

export function classifyBlockerKind(
  reason: string,
  blockedBy: readonly string[],
  lifecycleState: string,
): BlockerProfile {
  const normalized = [reason, ...blockedBy, lifecycleState].join('\n').toLowerCase();
  let kind: BlockerKind = 'unknown';
  let recoverability: BlockerRecoverability = 'agent';

  if (/state|markdown|section|lifecycle|operational status|active_task|active correction/i.test(normalized)) {
    kind = 'state_corruption';
  } else if (/review|diff|acceptance|correction task/i.test(normalized)) {
    kind = 'review_failure';
  } else if (/implementation failed|implementation_failure|failed implementation|model passivity|no git diff|no progress/i.test(normalized)) {
    kind = 'implementation_failure';
  } else if (/task interface|first executable step|minimum progress evidence|scope|prompt/i.test(normalized)) {
    kind = 'task_interface_gap';
  } else if (/permission|approval|allow access|denied|ask-for-approval/i.test(normalized)) {
    kind = 'cli_mismatch';
  } else if (/binary|command|environment|missing|not found|path|install/i.test(normalized)) {
    kind = 'environment';
  }

  if (/terminal|unrecoverable|cannot recover|no unblock|no doctor recovery|no state correction/i.test(normalized)) {
    recoverability = 'terminal';
  } else if (kind === 'environment') {
    recoverability = 'human';
  }

  const evidence = uniqueStrings([
    reason.trim(),
    ...blockedBy.slice(0, 3),
    `lifecycle=${lifecycleState}`,
  ].filter((item) => item.length > 0));

  return {
    kind,
    signature: buildBlockerSignature(kind, lifecycleState, reason, blockedBy),
    evidence,
    recoverability,
    observed_state: `lifecycle=${lifecycleState}`,
  };
}

export function buildBlockerSignature(
  kind: BlockerKind,
  lifecycleState: string,
  reason: string,
  blockedBy: readonly string[],
): string {
  const seed = [kind, lifecycleState, reason, ...blockedBy].join(' ');
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || `${kind}-${lifecycleState}`.toLowerCase();
}
