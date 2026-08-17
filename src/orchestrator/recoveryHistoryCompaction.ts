import { optionalSection, replaceSection } from '../markdown/sections.js';
import { uniqueStrings } from '../shared/arrays.js';

/**
 * "Recovery History" is not written by any deterministic code path (see ADR-0037) -- each
 * doctor-recovery task's own planner-generated instructions tell the executing AI to append a
 * new entry while preserving every prior one verbatim, so the section only ever grows. Because a
 * feature's own state.md (and docs/compassrose/PROJECT_STATE.md) is listed as "Read only" context
 * on every future doctor-recovery planning and execution prompt, that unbounded growth becomes
 * real, paid context on every subsequent recovery attempt for as long as the feature keeps
 * needing them -- exactly the accumulation ADR-0034 exists to prevent.
 */
const RECOVERY_HISTORY_COMPACTION_THRESHOLD_CHARS = 1500;

/**
 * Collapses an over-grown "Recovery History" section into a single line naming every recovery
 * task id it summarizes, once the section exceeds the threshold. Detail is not duplicated here --
 * it already lives in git history and the artifact store (`.git/proto-compassrose/blockers/`,
 * `.git/proto-compassrose/recovery-lessons/`). A future recovery on the same feature then starts
 * a fresh, small log instead of resuming a growing one. No-op when the section is short or
 * absent (most features never accumulate one at all).
 */
export function compactRecoveryHistorySection(markdown: string): string {
  const body = optionalSection(markdown, 'Recovery History');
  if (body === null || body.length <= RECOVERY_HISTORY_COMPACTION_THRESHOLD_CHARS) {
    return markdown;
  }

  const recoveryTaskIds = uniqueStrings(
    Array.from(body.matchAll(/`([A-Za-z0-9]+-DR\d+)`/g)).map((match) => match[1] ?? ''),
  ).filter((id) => id.length > 0);

  const summary = recoveryTaskIds.length > 0
    ? `- Compacted ${recoveryTaskIds.length} doctor recovery cycle(s) recorded before this point (${recoveryTaskIds.join(', ')}). Full detail: \`.git/proto-compassrose/blockers/\`, \`.git/proto-compassrose/recovery-lessons/\`, and git history.`
    : '- Recovery history recorded before this point was compacted. Full detail: git history.';

  return replaceSection(markdown, 'Recovery History', summary);
}
