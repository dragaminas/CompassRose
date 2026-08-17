import type { BlockerKind, BlockerRecoverability } from '../contracts/runtime/diagnosticAutocorrection.js';
import type { DiagnosticClassification } from '../contracts/runtime/attempts.js';
import type { BlockerProfile } from '../contracts/task/taskContracts.js';
import { resolveUnanimousVote, uniqueStrings } from '../shared/arrays.js';

/**
 * Maps a structured implementation diagnostic (already computed by classifyImplementation(), see
 * src/orchestrator/implementationDiagnostics.ts) directly to a BlockerKind. Per ADR-0031/ADR-0034,
 * a caller that already has this fact must read it through this table rather than re-deriving it
 * by regex-matching prose that happens to quote it (e.g. buildImplementationErrorMessage()'s
 * rendered text) -- that re-derivation only works by accident and silently degrades if the prose
 * wording ever changes. Returns null for 'unknown', signaling that no structured fact is
 * available and the caller should fall back to classifyBlockerKind()'s free-text classification.
 */
const DIAGNOSTIC_CLASSIFICATION_TO_BLOCKER_KIND: Readonly<Record<DiagnosticClassification, BlockerKind | null>> = {
  context_overflow: 'implementation_failure',
  reviewable_diff_lost: 'implementation_failure',
  model_passivity: 'implementation_failure',
  missing_implementation_notes: 'task_interface_gap',
  already_complete: 'task_interface_gap',
  permission_prompt: 'cli_mismatch',
  tool_refusal: 'cli_mismatch',
  ui_cli_behavior: 'cli_mismatch',
  provider_failure: 'environment',
  unknown: null,
};

export function classifyDiagnosticKind(classification: DiagnosticClassification): BlockerKind | null {
  return DIAGNOSTIC_CLASSIFICATION_TO_BLOCKER_KIND[classification];
}

export function classifyBlockerKind(
  reason: string,
  blockedBy: readonly string[],
  lifecycleState: string,
): BlockerProfile {
  const normalized = [reason, ...blockedBy, lifecycleState].join('\n').toLowerCase();
  let kind: BlockerKind = 'unknown';

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

  return finalizeBlockerProfile(kind, reason, blockedBy, lifecycleState);
}

/**
 * Builds the full BlockerProfile envelope (signature, evidence, recoverability, observed_state)
 * around a kind that is already known -- shared by classifyBlockerKind() (kind guessed from
 * prose, above) and any caller that already has a structured kind (e.g. via
 * classifyDiagnosticKind(), or an objective non-AI signal like a failed quality gate) so both
 * paths produce an identically-shaped profile from the same tail logic.
 */
export function finalizeBlockerProfile(
  kind: BlockerKind,
  reason: string,
  blockedBy: readonly string[],
  lifecycleState: string,
): BlockerProfile {
  const normalized = [reason, ...blockedBy, lifecycleState].join('\n').toLowerCase();
  let recoverability: BlockerRecoverability = 'agent';

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

/**
 * Combines independent classification votes (each an AI call that saw the same declared,
 * minimal input with no shared history between calls -- see ADR-0034 and the accompanying
 * ADR entry for this ensemble) into one outcome. Unanimous agreement is trusted as-is. Any
 * disagreement -- including a vote of 'unknown' -- means the ensemble itself could not settle
 * the question; picking a winner by majority would just reintroduce an unverified guess, the
 * exact thing this ensemble exists to replace. Disagreement is reported, not resolved here --
 * see buildEnsembleDisagreementProfile() for how the caller must escalate it.
 */
export function resolveBlockerKindEnsemble(
  votes: readonly BlockerKind[],
): { readonly kind: BlockerKind; readonly agreed: boolean } {
  const resolved = resolveUnanimousVote(votes);
  return resolved.agreed ? { kind: resolved.value, agreed: true } : { kind: 'unknown', agreed: false };
}

/**
 * Builds the BlockerProfile for a disagreeing ensemble: kind is 'unknown' by construction
 * (resolveBlockerKindEnsemble() above already established that) and recoverability is forced to
 * 'human' unconditionally -- unlike finalizeBlockerProfile()'s default of 'agent' for an unknown
 * kind, guessing which vote to trust here would defeat the reason the ensemble exists. The raw
 * votes are preserved as evidence so a human reviewing the blocker can see exactly what each
 * independent attempt concluded.
 */
export function buildEnsembleDisagreementProfile(
  votes: readonly BlockerKind[],
  reason: string,
  blockedBy: readonly string[],
  lifecycleState: string,
): BlockerProfile {
  const evidence = uniqueStrings([
    reason.trim(),
    `ensemble disagreed: ${votes.join(', ')}`,
    ...blockedBy.slice(0, 3),
    `lifecycle=${lifecycleState}`,
  ].filter((item) => item.length > 0));

  return {
    kind: 'unknown',
    signature: buildBlockerSignature('unknown', lifecycleState, reason, blockedBy),
    evidence,
    recoverability: 'human',
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
