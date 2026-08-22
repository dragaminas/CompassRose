/**
 * The bookkeeping a task accumulates between being planned and being approved
 * (025-automated-development-loop).
 *
 * Every internal step used to commit separately -- plan the task, prepare the subtask, approve the
 * review -- so a single unit of work landed as three or four commits and the history read as
 * telemetry rather than work. The steps still happen and are still recorded; they just stop being
 * commit boundaries. What each one would have said becomes a line in the body of the one commit
 * the task does produce.
 *
 * The trail is persisted in the artifact store rather than held in memory, because a task's arc
 * routinely spans more than one run: a run that stops after planning and a run that finishes the
 * task are different processes, and an in-memory trail would silently lose the first half.
 */
export interface TaskCommitTrailEntry {
  /** Short label for the step, e.g. `planned`, `implemented`, `review`. */
  readonly step: string;
  readonly detail: string;
  /** ISO timestamp, so a trail spanning several runs still reads in order. */
  readonly at: string;
}

/**
 * Bounded like every other accumulating structure in this codebase. A task that keeps retrying
 * could otherwise produce a commit message thousands of lines long; the full detail lives in the
 * artifact store either way, so the body only has to stay readable.
 */
export const MAX_RENDERED_TRAIL_ENTRIES = 40;

export function renderTaskCommitMessage(subject: string, entries: readonly TaskCommitTrailEntry[]): string {
  if (entries.length === 0) {
    // A task planned before this trail existed, or one whose trail could not be read. The subject
    // alone is still a correct commit message -- never fail a commit over its own body.
    return subject;
  }

  const rendered = entries.slice(0, MAX_RENDERED_TRAIL_ENTRIES).map((entry) => `- ${entry.step}: ${entry.detail}`);
  const omitted = entries.length - rendered.length;
  if (omitted > 0) {
    rendered.push(`- ... and ${omitted} earlier step(s); full detail in .git/proto-compassrose/`);
  }

  return [subject, '', ...rendered].join('\n');
}
