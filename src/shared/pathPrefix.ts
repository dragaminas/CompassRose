function stripTrailingSlash(prefix: string): string {
  return prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
}

/**
 * True when `path` is exactly one of `allowedPrefixes`, or lives under one of them as a
 * directory. A prefix's own trailing slash (if any) is normalized away first — real callers
 * (an LLM-authored task or task-request scope, a human-written CONFIG.md allowlist) routinely
 * write directory entries with a trailing slash (`"tests/"`), and this must still match a file
 * under it (`"tests/foo.test.ts"`) rather than silently failing on the resulting double slash.
 */
export function isPathAllowedByPrefix(path: string, allowedPrefixes: readonly string[]): boolean {
  return allowedPrefixes.some((rawPrefix) => {
    const prefix = stripTrailingSlash(rawPrefix);
    return path === prefix || path.startsWith(`${prefix}/`);
  });
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
