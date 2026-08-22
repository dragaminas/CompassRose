/**
 * What CompassRose knows about the repository it is pointed at (028-project-understanding).
 *
 * Everything CompassRose does depends on facts about the project: which commands are quality gates,
 * where source lives, what language it is written in. Those facts used to come exclusively from
 * `CONFIG.md`, typed in by a human at setup -- which makes first contact with the tool an exercise
 * in filling out a form about your own repository, and makes CompassRose unable to say anything
 * useful about a codebase it did not help write.
 */

/**
 * Where a fact came from. The three are not interchangeable, and the precedence rule between them
 * governs this whole feature: **`confirmed` outranks `detected` outranks `inferred`.**
 *
 * A later detection never overwrites a confirmation; it raises a contradiction and waits. Without
 * that, the feature degrades into the failure mode rejected everywhere else in this design -- a
 * machine quietly replacing a human decision with its own guess.
 */
export type FactProvenance =
  | { readonly kind: 'detected'; readonly signal: string }
  | { readonly kind: 'inferred'; readonly at: string }
  | { readonly kind: 'confirmed'; readonly by: string; readonly at: string };

export interface ProjectFact<T> {
  readonly value: T;
  readonly provenance: FactProvenance;
}

export interface ProjectFacts {
  readonly languages: ProjectFact<readonly string[]> | null;
  readonly packageManager: ProjectFact<string> | null;
  readonly buildSystem: ProjectFact<string> | null;
  readonly testSystem: ProjectFact<string> | null;
  readonly sourceRoots: ProjectFact<readonly string[]> | null;
  readonly documentationRoots: ProjectFact<readonly string[]> | null;
  /** Every declared script, as candidates. Choosing which are *the* gates is a judgment, not a fact. */
  readonly scripts: ProjectFact<readonly string[]> | null;
  /** What the project is for. No file states this, so it is only ever inferred or confirmed. */
  readonly purpose: ProjectFact<string> | null;
}

export const EMPTY_PROJECT_FACTS: ProjectFacts = {
  languages: null,
  packageManager: null,
  buildSystem: null,
  testSystem: null,
  sourceRoots: null,
  documentationRoots: null,
  scripts: null,
  purpose: null,
};

const PROVENANCE_RANK: Readonly<Record<FactProvenance['kind'], number>> = {
  confirmed: 2,
  detected: 1,
  inferred: 0,
};

export function outranks(candidate: FactProvenance, existing: FactProvenance): boolean {
  return PROVENANCE_RANK[candidate.kind] > PROVENANCE_RANK[existing.kind];
}

export interface FactContradiction {
  readonly field: string;
  readonly confirmedValue: string;
  readonly detectedValue: string;
}

/**
 * Merges freshly detected facts over recorded ones, and reports every place the two disagree about
 * something a human already confirmed.
 *
 * The merge never resolves a contradiction. It keeps the confirmed value and hands the disagreement
 * back, because resolving it is a human's call -- and reporting it is the only reason to detect
 * again at all.
 */
export function mergeDetectedFacts(
  recorded: ProjectFacts,
  detected: ProjectFacts,
): { readonly facts: ProjectFacts; readonly contradictions: readonly FactContradiction[] } {
  const contradictions: FactContradiction[] = [];
  const merged: Record<string, ProjectFact<unknown> | null> = {};

  for (const field of Object.keys(recorded) as (keyof ProjectFacts)[]) {
    const existing = recorded[field];
    const fresh = detected[field];

    if (!fresh) {
      merged[field] = existing;
      continue;
    }

    if (!existing) {
      merged[field] = fresh;
      continue;
    }

    if (existing.provenance.kind === 'confirmed') {
      const confirmedValue = JSON.stringify(existing.value);
      const detectedValue = JSON.stringify(fresh.value);
      if (confirmedValue !== detectedValue) {
        contradictions.push({ field, confirmedValue, detectedValue });
      }
      merged[field] = existing;
      continue;
    }

    merged[field] = outranks(fresh.provenance, existing.provenance) || fresh.provenance.kind === existing.provenance.kind
      ? fresh
      : existing;
  }

  return { facts: merged as unknown as ProjectFacts, contradictions };
}

export function confirmFact<T>(fact: ProjectFact<T> | null, by: string): ProjectFact<T> | null {
  if (!fact) {
    return null;
  }

  return { value: fact.value, provenance: { kind: 'confirmed', by, at: new Date().toISOString().slice(0, 10) } };
}

function describeProvenance(provenance: FactProvenance): string {
  if (provenance.kind === 'detected') {
    return `detected from ${provenance.signal}`;
  }
  if (provenance.kind === 'inferred') {
    return `inferred ${provenance.at} — confirm or correct this`;
  }
  return `confirmed by ${provenance.by}, ${provenance.at}`;
}

function describeValue(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

const FACT_LABELS: Readonly<Record<keyof ProjectFacts, string>> = {
  languages: 'Languages',
  packageManager: 'Package manager',
  buildSystem: 'Build system',
  testSystem: 'Test system',
  sourceRoots: 'Source roots',
  documentationRoots: 'Documentation roots',
  scripts: 'Declared scripts',
  purpose: 'Purpose',
};

const LABEL_TO_FIELD: Readonly<Record<string, keyof ProjectFacts>> = Object.fromEntries(
  Object.entries(FACT_LABELS).map(([field, label]) => [label, field as keyof ProjectFacts]),
) as Readonly<Record<string, keyof ProjectFacts>>;

const ARRAY_FIELDS: ReadonlySet<keyof ProjectFacts> = new Set([
  'languages',
  'sourceRoots',
  'documentationRoots',
  'scripts',
]);

function parseProvenance(line: string): FactProvenance | null {
  const detected = line.match(/^_detected from (.+)_$/);
  if (detected) {
    return { kind: 'detected', signal: detected[1]! };
  }

  const inferred = line.match(/^_inferred (\S+)/);
  if (inferred) {
    return { kind: 'inferred', at: inferred[1]! };
  }

  const confirmed = line.match(/^_confirmed by (.+), (\S+)_$/);
  if (confirmed) {
    return { kind: 'confirmed', by: confirmed[1]!, at: confirmed[2]! };
  }

  return null;
}

/**
 * Reads back what `renderProjectFactsDocument` wrote.
 *
 * A section whose provenance line cannot be parsed is dropped rather than guessed at: a fact whose
 * origin is unknown is exactly what this document exists to prevent, and inventing `detected` for
 * it would be the worst possible default.
 */
export function parseProjectFactsDocument(markdown: string): ProjectFacts {
  const facts: Record<string, ProjectFact<unknown> | null> = { ...EMPTY_PROJECT_FACTS };

  for (const section of markdown.split(/^## /m).slice(1)) {
    const lines = section.split('\n');
    const label = (lines[0] ?? '').trim();
    const field = LABEL_TO_FIELD[label];
    if (!field) {
      continue;
    }

    const body = lines.slice(1).map((line) => line.trim()).filter((line) => line.length > 0);
    const provenanceLine = body.find((line) => line.startsWith('_'));
    const valueLine = body.find((line) => !line.startsWith('_'));
    if (!provenanceLine || !valueLine || valueLine === 'Not established.') {
      continue;
    }

    const provenance = parseProvenance(provenanceLine);
    if (!provenance) {
      continue;
    }

    facts[field] = {
      value: ARRAY_FIELDS.has(field) ? valueLine.split(',').map((part) => part.trim()).filter((part) => part.length > 0) : valueLine,
      provenance,
    };
  }

  return facts as unknown as ProjectFacts;
}

/**
 * Records each fact with its provenance, so reading the document answers "does CompassRose actually
 * know this, or did it guess?" without running anything.
 */
export function renderProjectFactsDocument(facts: ProjectFacts): string {
  const lines: string[] = [
    '# Project Facts',
    '',
    'What CompassRose knows about this repository, and how it knows it.',
    '',
    'Detected facts were read from the repository. Inferred ones are guesses that want your',
    'confirmation. Confirmed ones outrank both: a later detection that disagrees with a confirmed',
    'fact is reported, never applied.',
    '',
  ];

  for (const field of Object.keys(FACT_LABELS) as (keyof ProjectFacts)[]) {
    const fact = facts[field];
    lines.push(`## ${FACT_LABELS[field]}`, '');
    if (!fact) {
      lines.push('Not established.', '');
      continue;
    }

    lines.push(describeValue(fact.value), '', `_${describeProvenance(fact.provenance)}_`, '');
  }

  return lines.join('\n');
}
