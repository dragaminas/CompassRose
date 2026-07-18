/**
 * True when `path` is exactly one of `allowedPrefixes`, or lives under one of them as a
 * directory. Prefixes must not have a trailing slash — `isPathAllowedByPrefix('a/b', ['a'])`
 * is true, but `isPathAllowedByPrefix('a/b', ['a/'])` is false by construction, since the
 * check appends its own separator.
 */
export function isPathAllowedByPrefix(path: string, allowedPrefixes: readonly string[]): boolean {
  return allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * True when every path in `paths` is covered by at least one of `allowedPrefixes`, per
 * isPathAllowedByPrefix. Used to check a proposed task's scope against a pre-declared,
 * locked-in boundary (see src/contracts/planner/plannerContracts.ts's TaskRequest).
 */
export function allPathsAllowedByPrefix(paths: readonly string[], allowedPrefixes: readonly string[]): boolean {
  return paths.every((path) => isPathAllowedByPrefix(path, allowedPrefixes));
}

/** The subset of `paths` not covered by any prefix in `allowedPrefixes`. */
export function pathsExceedingPrefixes(paths: readonly string[], allowedPrefixes: readonly string[]): string[] {
  return paths.filter((path) => !isPathAllowedByPrefix(path, allowedPrefixes));
}
