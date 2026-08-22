import { join } from 'node:path';
import type { ProjectConfiguration } from './configTypes.js';

/**
 * The single literal root-directory name every CompassRose-owned document lives under,
 * isolated from the target repository's own `docs/` tree. This is the only hardcoded
 * occurrence of the literal 'compassrose' path segment in the codebase -- every other
 * consumer must go through the builders below (or `resolveCompassRoseRoot`) instead of
 * re-typing the literal, so a future root-name change never has to be hunted down site by
 * site again.
 */
export const DEFAULT_COMPASSROSE_ROOT = 'compassrose';

/**
 * The one place allowed to locate CONFIG.md before it has been parsed -- a chicken-and-egg
 * bootstrap path that can never itself be config-driven, since you need to read config to
 * find config. Returns a real filesystem path (not a repo-relative string), for direct use
 * with fs operations. Used by src/cli/main.ts, src/doctor/doctorCommand.ts,
 * src/orchestrator/orchestrator.ts, src/cli/setup.ts, and tests/testUtils.ts instead of each
 * re-typing the literal independently.
 */
export function getBootstrapConfigPath(repositoryRoot: string): string {
  return join(repositoryRoot, DEFAULT_COMPASSROSE_ROOT, 'CONFIG.md');
}

/**
 * Every repo-relative path below CompassRose's own root derives from this single resolved
 * value instead of re-typing 'compassrose'. If `documentation.compassrose_root` is configured,
 * it must match the runtime's own bootstrap constant -- Doctor enforces this as a
 * self-consistency check, not a redirect capability: the field documents where CompassRose
 * already looked, it can't tell CompassRose to look somewhere else after CONFIG.md was already
 * found there.
 */
export function resolveCompassRoseRoot(configuration: Pick<ProjectConfiguration, 'documentation'>): string {
  const documentation = configuration.documentation as Record<string, unknown>;
  const configured = documentation.compassrose_root;
  return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : DEFAULT_COMPASSROSE_ROOT;
}

// All builders below return repo-relative, forward-slash string paths -- the shape every
// existing prompt "Read only" bullet and allowed-path/sourcePaths array already uses (they are
// rendered directly into prompt text and passed to resolveRepositoryRelativePath() when an
// actual filesystem path is needed, exactly like the docs/features/... literals they replace).
function joinRelative(...segments: readonly string[]): string {
  return segments.filter((segment) => segment.length > 0).join('/');
}

export function buildFeaturesRoot(root: string): string {
  return joinRelative(root, 'features');
}

export function buildFixesRoot(root: string): string {
  return joinRelative(root, 'fixes');
}

export function buildFeaturePath(root: string, featureId: string, ...segments: readonly string[]): string {
  return joinRelative(root, 'features', featureId, ...segments);
}

export function buildFixPath(root: string, fixId: string, ...segments: readonly string[]): string {
  return joinRelative(root, 'fixes', fixId, ...segments);
}

export function buildFeaturesReadmePath(root: string): string {
  return joinRelative(root, 'features', 'README.md');
}

export function buildFixesReadmePath(root: string): string {
  return joinRelative(root, 'fixes', 'README.md');
}

export function buildTemplatePath(root: string, name: string): string {
  return joinRelative(root, 'templates', name);
}

export function buildAdrPath(root: string): string {
  return joinRelative(root, 'ADR.md');
}

export function buildSadPath(root: string): string {
  return joinRelative(root, 'SAD.md');
}

export function buildRoadmapPath(root: string): string {
  return joinRelative(root, 'ROADMAP.md');
}

export function buildDmsPath(root: string): string {
  return joinRelative(root, 'DMS.md');
}

export function buildProjectStatePath(root: string): string {
  return joinRelative(root, 'PROJECT_STATE.md');
}

export function buildConfigPath(root: string): string {
  return joinRelative(root, 'CONFIG.md');
}

/**
 * Specification coverage (024-specification-flow). A separate document from CONFIG.md on purpose:
 * this holds per-dimension state that changes every session, and CONFIG.md is policy.
 */
export function buildDimensionsPath(root: string): string {
  return joinRelative(root, 'DIMENSIONS.md');
}

/**
 * What CompassRose knows about this repository, and how it knows it
 * (028-project-understanding). Four documents, four distinct concerns: CONFIG.md is policy,
 * PROJECT_STATE.md is progress, DIMENSIONS.md is specification coverage, and this is knowledge.
 */
export function buildProjectFactsPath(root: string): string {
  return joinRelative(root, 'PROJECT_FACTS.md');
}

/**
 * Replaces the old `path.startsWith('docs/')` heuristic (src/task/taskDocument.ts) for
 * recognizing a documentation-only task scope, now that CompassRose's own docs live under
 * `root` instead of the target repository's `docs/`.
 */
export function isUnderCompassRoseRoot(path: string, root: string): boolean {
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`;
  return path === root || path.startsWith(normalizedRoot);
}
