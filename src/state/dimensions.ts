/**
 * The coverage checklist a specification session works against (024-specification-flow).
 *
 * Two layers, and the asymmetry between them is the whole design:
 *
 * - **A declared floor.** A list that lives in the repository, the same every session, editable by
 *   a human. It cannot be skipped, and it produces the coverage report when a session closes.
 * - **Bounded growth.** The agent may *propose* a dimension the list does not contain. A proposal
 *   is never added on its own: a human accepts it -- and it joins the declared floor for every
 *   future session -- or discards it with a reason, which is what stops it being re-proposed.
 *
 * So the model can grow the checklist and can never replace it, every growth is a human decision,
 * and the decision is persisted. Same principle as everywhere else in this codebase: the model
 * proposes, a literal human action decides.
 *
 * Coverage is a fact about the *project* and lives in the repository. Competencies are a fact about
 * the *person* and never do (see `src/contracts/brainstormer/competency.ts`).
 */
import { existsSync } from 'node:fs';
import { readUtf8 } from '../filesystem/textNormalization.js';

export type DimensionState = 'uncovered' | 'covered' | 'out_of_scope';

export interface DimensionDecision {
  readonly state: DimensionState;
  /** Mandatory for `out_of_scope`; how the decision is justified to whoever reads this later. */
  readonly reason: string | null;
  readonly by: string;
  readonly at: string;
}

export interface Dimension {
  readonly name: string;
  readonly state: DimensionState;
  /** Which features cover it, when `covered`. */
  readonly coveredBy: readonly string[];
  /**
   * Appended, never overwritten. A reopened dimension keeps the prior decision visible with its
   * original author and date, so the document reads as a history of judgment rather than a
   * current-value store -- which is what makes it safe for a second person to disagree with the
   * first.
   */
  readonly decisions: readonly DimensionDecision[];
}

/**
 * The starter list `compassrose setup` writes. Generic on purpose: it is a floor for any project,
 * and the agent's proposals are how it becomes specific to this one.
 */
export const STARTER_DIMENSIONS: readonly string[] = [
  'user interface',
  'persistence and data',
  'errors and failure handling',
  'configuration',
  'security and access',
  'deployment and installation',
  'testing and verification',
  'performance and limits',
  'existing data and migration',
  'observability',
];

export function renderDimensionsDocument(dimensions: readonly Dimension[]): string {
  const lines: string[] = [
    '# Specification Coverage',
    '',
    'The dimensions this project must address, and where each one stands.',
    '',
    'This is a floor, not a ceiling: a specification session walks it every time, and the agent may',
    'propose dimensions it does not contain. A proposal only joins this list when a human accepts it,',
    'and only leaves it as `out_of_scope` with a written reason. Nothing here is final — any decision',
    'can be reopened in a later session, and reopening appends rather than overwrites.',
    '',
  ];

  for (const dimension of dimensions) {
    lines.push(`## ${dimension.name}`, '');
    lines.push(`State: ${dimension.state}`);

    if (dimension.coveredBy.length > 0) {
      lines.push(`Covered by: ${dimension.coveredBy.join(', ')}`);
    }

    for (const decision of dimension.decisions) {
      lines.push(
        decision.reason
          ? `- ${decision.state} — ${decision.reason} (${decision.by}, ${decision.at})`
          : `- ${decision.state} (${decision.by}, ${decision.at})`,
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function parseDimensionsDocument(markdown: string): Dimension[] {
  const dimensions: Dimension[] = [];
  const sections = markdown.split(/^## /m).slice(1);

  for (const section of sections) {
    const [heading = '', ...rest] = section.split('\n');
    const name = heading.trim();
    if (name.length === 0) {
      continue;
    }

    const body = rest.join('\n');
    const stateMatch = body.match(/^State:\s*(\S+)/m);
    const coveredMatch = body.match(/^Covered by:\s*(.+)$/m);

    const decisions: DimensionDecision[] = [];
    for (const line of body.split('\n')) {
      const decisionMatch = line.match(/^- (uncovered|covered|out_of_scope)(?: — (.+?))? \(([^,]+), ([^)]+)\)\s*$/);
      if (decisionMatch) {
        decisions.push({
          state: decisionMatch[1] as DimensionState,
          reason: decisionMatch[2] ?? null,
          by: decisionMatch[3]!,
          at: decisionMatch[4]!,
        });
      }
    }

    dimensions.push({
      name,
      state: (stateMatch?.[1] as DimensionState | undefined) ?? 'uncovered',
      coveredBy: coveredMatch?.[1] ? coveredMatch[1].split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0) : [],
      decisions,
    });
  }

  return dimensions;
}

export function readDimensions(path: string): Dimension[] {
  if (!existsSync(path)) {
    return STARTER_DIMENSIONS.map((name) => ({ name, state: 'uncovered' as const, coveredBy: [], decisions: [] }));
  }

  return parseDimensionsDocument(readUtf8(path));
}

/**
 * Records a human's decision about one dimension, appending rather than replacing.
 *
 * Refuses an `out_of_scope` with no reason. That refusal is the point: a discard without a reason is
 * indistinguishable, six months later, from an oversight -- and this document exists precisely so
 * that distinction survives.
 */
export function decideDimension(
  dimensions: readonly Dimension[],
  name: string,
  decision: DimensionDecision,
): Dimension[] {
  if (decision.state === 'out_of_scope' && (!decision.reason || decision.reason.trim().length === 0)) {
    throw new Error(`Discarding the "${name}" dimension requires a reason.`);
  }

  const existing = dimensions.find((dimension) => dimension.name === name);
  if (!existing) {
    return [...dimensions, { name, state: decision.state, coveredBy: [], decisions: [decision] }];
  }

  return dimensions.map((dimension) =>
    dimension.name === name
      ? { ...dimension, state: decision.state, decisions: [...dimension.decisions, decision] }
      : dimension,
  );
}

/** Marks a dimension covered by a feature. Additive: a dimension can be covered by several. */
export function markCovered(
  dimensions: readonly Dimension[],
  name: string,
  featureId: string,
  by: string,
): Dimension[] {
  const at = new Date().toISOString().slice(0, 10);
  const existing = dimensions.find((dimension) => dimension.name === name);

  if (!existing) {
    return [...dimensions, {
      name,
      state: 'covered',
      coveredBy: [featureId],
      decisions: [{ state: 'covered', reason: `covered by ${featureId}`, by, at }],
    }];
  }

  if (existing.coveredBy.includes(featureId)) {
    return [...dimensions];
  }

  return dimensions.map((dimension) =>
    dimension.name === name
      ? {
          ...dimension,
          state: 'covered',
          coveredBy: [...dimension.coveredBy, featureId],
          decisions: [...dimension.decisions, { state: 'covered' as const, reason: `covered by ${featureId}`, by, at }],
        }
      : dimension,
  );
}

export interface CoverageReport {
  readonly covered: readonly { readonly name: string; readonly coveredBy: readonly string[] }[];
  readonly uncovered: readonly string[];
  readonly outOfScope: readonly { readonly name: string; readonly reason: string }[];
}

/**
 * What a session closes with. `uncovered` and `outOfScope` are reported separately on purpose:
 * "nothing covers this yet" and "we decided this does not apply" are different facts, and collapsing
 * them is how a gap becomes invisible.
 */
export function buildCoverageReport(dimensions: readonly Dimension[]): CoverageReport {
  return {
    covered: dimensions
      .filter((dimension) => dimension.state === 'covered')
      .map((dimension) => ({ name: dimension.name, coveredBy: dimension.coveredBy })),
    uncovered: dimensions.filter((dimension) => dimension.state === 'uncovered').map((dimension) => dimension.name),
    outOfScope: dimensions
      .filter((dimension) => dimension.state === 'out_of_scope')
      .map((dimension) => ({
        name: dimension.name,
        reason: [...dimension.decisions].reverse().find((decision) => decision.state === 'out_of_scope')?.reason ?? 'no reason recorded',
      })),
  };
}
