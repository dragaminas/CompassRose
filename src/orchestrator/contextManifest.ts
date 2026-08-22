/**
 * What an agent is allowed to see, declared and measured (027-bounded-work-item-context).
 *
 * This is the project's foundational constraint made explicit. Context assembly used to be
 * implicit: `promptBuilding.ts` built each prompt from whatever the calling site decided to
 * include, nothing declared the boundary, nothing measured the size, and nothing recorded what an
 * agent turned out to need but did not get. The `context_overflow` failure classification existed
 * with no mechanism behind it, so an oversized task failed at runtime after an implementation call
 * had already been paid for.
 *
 * A manifest is the floor, not a cage: an implementer may read beyond it, within a declared cap,
 * and what it read is recorded and carried into that task's *next* attempt. The agent can grow a
 * declared floor; it can never replace it, and the growth never happens silently. Same asymmetry as
 * the dimensions checklist in 024-specification-flow.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readUtf8 } from '../filesystem/textNormalization.js';

export type ManifestEntryKind = 'specification' | 'architecture' | 'state' | 'contract' | 'code' | 'task';

export interface ManifestEntry {
  readonly kind: ManifestEntryKind;
  /** Repository-relative, forward slashes. */
  readonly path: string;
  /** Inclusive 1-based line range, or null for the whole file. */
  readonly lines: readonly [number, number] | null;
  /**
   * Why this entry is here. Mandatory by design: an entry nobody can justify is an entry that got
   * in by habit, and this field is what keeps manifests from growing into "include all of src/".
   */
  readonly reason: string;
}

export interface ContextManifest {
  readonly taskId: string;
  readonly role: 'planner' | 'implementer' | 'reviewer';
  readonly entries: readonly ManifestEntry[];
  /** Characters, not tokens -- see `measureManifest`. */
  readonly measuredSize: number;
  readonly budget: number;
}

/**
 * Repository paths are normalized at the boundary, every time.
 *
 * This codebase has already been bitten once by a Windows separator reaching a comparison that
 * assumed POSIX (`isPathAllowedByPrefix`, which silently reported a clean file as dirty). A manifest
 * is a new comparison surface, so it takes the normalization here rather than trusting callers.
 */
export function normalizeManifestPath(path: string): string {
  return path.split('\\').join('/');
}

export function manifestEntry(
  kind: ManifestEntryKind,
  path: string,
  reason: string,
  lines: readonly [number, number] | null = null,
): ManifestEntry {
  return { kind, path: normalizeManifestPath(path), lines, reason };
}

/**
 * Reads exactly what an entry names -- the whole file, or the named line range.
 *
 * A missing file yields empty content rather than throwing: a manifest that names something absent
 * is a planning defect worth surfacing through the budget check and the assembled prompt, not a
 * crash three layers down.
 */
export function readEntry(repositoryRoot: string, entry: ManifestEntry): string {
  const absolutePath = join(repositoryRoot, entry.path);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return '';
  }

  const contents = readUtf8(absolutePath);
  if (!entry.lines) {
    return contents;
  }

  const [start, end] = entry.lines;
  return contents.split('\n').slice(Math.max(0, start - 1), end).join('\n');
}

/**
 * Size in characters, over the assembled content rather than the entry list -- so a manifest's
 * measured size is exactly the size of what the agent receives.
 *
 * Characters, not tokens, deliberately. Token counts differ per provider, are unavailable without a
 * tokenizer dependency, and this project has no runtime dependencies at all. A character budget is
 * a deterministic, provider-independent proxy, and the configured budget is calibrated against it.
 */
export function measureManifest(repositoryRoot: string, entries: readonly ManifestEntry[]): number {
  return entries.reduce((total, entry) => total + readEntry(repositoryRoot, entry).length, 0);
}

export function buildManifest(input: {
  readonly repositoryRoot: string;
  readonly taskId: string;
  readonly role: ContextManifest['role'];
  readonly entries: readonly ManifestEntry[];
  readonly budget: number;
}): ContextManifest {
  return {
    taskId: input.taskId,
    role: input.role,
    entries: input.entries,
    measuredSize: measureManifest(input.repositoryRoot, input.entries),
    budget: input.budget,
  };
}

export function manifestFitsBudget(manifest: ContextManifest): boolean {
  // A budget of zero means unbounded, matching how every other optional limit in this codebase
  // treats absence (ADR-0040): a project that predates the field is completely unaffected.
  return manifest.budget <= 0 || manifest.measuredSize <= manifest.budget;
}

/**
 * The `Read only:` block a prompt gets, rendered from the manifest and from nothing else.
 *
 * `promptBuilding.ts` becomes a renderer with no authority to include anything a manifest does not
 * name -- which is the property that makes a run reproducible from its manifest.
 */
export function renderManifestForPrompt(manifest: ContextManifest): string[] {
  return manifest.entries.map((entry) =>
    entry.lines
      ? `- \`${entry.path}\` (lines ${entry.lines[0]}-${entry.lines[1]}) — ${entry.reason}`
      : `- \`${entry.path}\` — ${entry.reason}`,
  );
}

/**
 * Files an implementer read beyond its manifest, recorded per task.
 *
 * Carried into the manifest of that task's *next* attempt -- a correction or a retry -- and never
 * into a different task's, which would let one task's exploration silently inflate every later one.
 */
export interface ExplorationRecord {
  readonly taskId: string;
  readonly paths: readonly string[];
  readonly recordedAt: string;
}

export function mergeExploration(
  entries: readonly ManifestEntry[],
  exploration: ExplorationRecord | null,
): ManifestEntry[] {
  if (!exploration || exploration.paths.length === 0) {
    return [...entries];
  }

  const known = new Set(entries.map((entry) => entry.path));
  const additions = exploration.paths
    .map(normalizeManifestPath)
    .filter((path) => !known.has(path))
    .map((path) => manifestEntry('code', path, `read during a previous attempt at ${exploration.taskId}`));

  return [...entries, ...additions];
}
