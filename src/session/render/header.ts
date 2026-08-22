/**
 * The session header: what a human sees the moment they open CompassRose, before typing anything.
 *
 * Its job is orientation, not completeness -- a person who has not looked at this project for a
 * week should learn, in five lines, what state it is in and whether anything is waiting on them.
 */

export interface SessionHeaderInput {
  readonly projectName: string;
  readonly completedIds: readonly string[];
  readonly inProgressIds: readonly string[];
  readonly blockedIds: readonly string[];
  readonly awaitingValidationIds: readonly string[];
  readonly pendingSpecificationIds: readonly string[];
}

const MAX_LISTED_IDS = 3;

function summarizeIds(ids: readonly string[]): string {
  if (ids.length <= MAX_LISTED_IDS) {
    return ids.join(', ');
  }

  return `${ids.slice(0, MAX_LISTED_IDS).join(', ')} and ${ids.length - MAX_LISTED_IDS} more`;
}

export function renderSessionHeader(input: SessionHeaderInput): string[] {
  const total =
    input.completedIds.length
    + input.inProgressIds.length
    + input.blockedIds.length
    + input.awaitingValidationIds.length
    + input.pendingSpecificationIds.length;

  const lines: string[] = [
    `CompassRose · ${input.projectName}`,
    `${total} work item${total === 1 ? '' : 's'} · ${input.completedIds.length} complete`,
  ];

  // Only the buckets that need a human are listed by name. A quiet project prints two lines and a
  // prompt; a project with things waiting says exactly what and how many.
  if (input.blockedIds.length > 0) {
    lines.push(`blocked: ${summarizeIds(input.blockedIds)}`);
  }
  if (input.awaitingValidationIds.length > 0) {
    lines.push(`awaiting your validation: ${summarizeIds(input.awaitingValidationIds)}`);
  }
  if (input.pendingSpecificationIds.length > 0) {
    lines.push(`pending specification: ${summarizeIds(input.pendingSpecificationIds)}`);
  }

  lines.push('');
  lines.push('Type to talk. /help for commands.');
  lines.push('');

  return lines;
}
