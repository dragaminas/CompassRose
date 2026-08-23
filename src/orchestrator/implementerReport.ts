/**
 * The two things an implementer must say about its own run, beyond what it changed
 * (027-bounded-work-item-context).
 *
 * Both close the same gap from opposite ends. A manifest is a declared floor, and an implementer is
 * allowed to read past it -- but until it says what it read, the floor can never learn: the merge
 * that carries exploration into the next attempt existed, tested, with nothing feeding it. And a
 * task must not be handed a history of prior tasks, which leaves nothing to carry forward unless
 * each task states, explicitly and briefly, what the next one needs to know.
 *
 * Parsed from the implementer's own final reply rather than from a structured call, for the same
 * reason `## Implementation Notes` is: the implementer adapter runs a CLI whose only reliable output
 * is text, and adding a second structured call to ask it what it just did would double the cost of
 * every implementation to recover something it already knows.
 */

/**
 * How many paths an implementer may report reading beyond its manifest.
 *
 * The cap is the declared exploration allowance from the feature's acceptance criteria. Its purpose
 * is not to save bytes in this record -- it is that every path reported here lands in the *next*
 * attempt's manifest, so an uncapped report is an uncapped manifest one attempt later. Ten is
 * roughly "I had to look around a bit"; a hundred is "I read the repository", which is the thing a
 * bounded context exists to prevent.
 */
export const MAX_EXPLORATION_PATHS = 10;

export interface ImplementerReport {
  /** Paths read beyond the manifest, normalized, deduplicated, and capped. */
  readonly readBeyondManifest: readonly string[];
  /** What the next task needs to know, or null when the implementer said nothing. */
  readonly handOff: string | null;
  /** True when the report named more paths than the cap allows. */
  readonly explorationCapped: boolean;
}

const READ_BEYOND_LABEL = /^\s*(?:[-*]\s*)?read[ _-]beyond[ _-]manifest\s*:\s*(.*)$/i;
const HAND_OFF_LABEL = /^\s*(?:[-*]\s*)?next[ _-]task[ _-]needs[ _-]to[ _-]know\s*:\s*(.*)$/i;

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, '')
    .split('\\')
    .join('/')
    .trim();
}

function splitPaths(value: string): string[] {
  return value
    .split(/[,;]/)
    .map(normalizePath)
    .filter((path) => path.length > 0 && path.toLowerCase() !== 'none');
}

/**
 * Reads both fields out of whatever the implementer said.
 *
 * Tolerant on purpose: an implementer that omits either field is not a failure here. A missing
 * exploration report reads as "nothing beyond the manifest", and a missing hand-off reads as
 * "nothing the next task needs" -- both of which are legitimate outcomes for a self-contained task.
 * The contract asks for them; enforcement, if it ever belongs anywhere, belongs to review.
 */
export function parseImplementerReport(rawOutput: string): ImplementerReport {
  const paths: string[] = [];
  let handOff: string | null = null;

  for (const line of rawOutput.split(/\r?\n/)) {
    const explored = line.match(READ_BEYOND_LABEL);
    if (explored?.[1] !== undefined) {
      paths.push(...splitPaths(explored[1]));
      continue;
    }

    const handedOff = line.match(HAND_OFF_LABEL);
    if (handedOff?.[1] !== undefined) {
      const stated = handedOff[1].trim();
      // "none" is an answer, and a different one from silence: it says the implementer considered
      // the question. Both end up as null here, but only because nothing downstream distinguishes
      // them yet.
      handOff = stated.length > 0 && stated.toLowerCase() !== 'none' ? stated : null;
    }
  }

  const unique = [...new Set(paths)];
  return {
    readBeyondManifest: unique.slice(0, MAX_EXPLORATION_PATHS),
    handOff,
    explorationCapped: unique.length > MAX_EXPLORATION_PATHS,
  };
}
