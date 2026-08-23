import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Gives CONFIG.md's "External tool isolation" rule its first mechanism (030-execution-trust).
 *
 * That section has said from the beginning that CompassRose "must not silently modify global user
 * configuration files, including but not limited to `~/.codex/*`". Nothing had ever checked, and in
 * the author's own config the rule had been broken about a hundred times over: one
 * `[projects.'…']` trust grant per throwaway fixture workspace the test suite had ever created,
 * each one naming a directory that no longer exists.
 *
 * CompassRose cannot stop an external CLI writing to its own configuration -- that file belongs to
 * that tool. What it can do is notice, and say so, which is the difference between a rule and a
 * sentence about a rule.
 *
 * Read-only throughout, like the rest of doctor. It reports; a human decides whether to prune.
 */

/** A `[projects.'<path>']` entry naming a directory that is no longer on disk. */
export interface StaleTrustEntry {
  readonly path: string;
}

const PROJECT_SECTION = /^\s*\[projects\.(?:'([^']*)'|"([^"]*)")\]\s*$/;

/**
 * Trust grants in an agent CLI's config that point at directories which no longer exist.
 *
 * Pure over the file's text so it can be asserted without a real config on disk. Stale rather than
 * "all" entries: a grant for a repository someone actually works in is the tool behaving normally,
 * and flagging it would bury the signal. A grant for a path that has been deleted can only be
 * residue.
 */
export function findStaleTrustEntries(
  configToml: string,
  directoryExists: (path: string) => boolean = existsSync,
): readonly StaleTrustEntry[] {
  const stale: StaleTrustEntry[] = [];

  for (const line of configToml.split('\n')) {
    const match = PROJECT_SECTION.exec(line);
    const path = match?.[1] ?? match?.[2];
    if (path && !directoryExists(path)) {
      stale.push({ path });
    }
  }

  return stale;
}

/** Where codex keeps its configuration, honoring the same override the CLI itself honors. */
export function codexConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env['CODEX_HOME'] ?? join(homedir(), '.codex'), 'config.toml');
}

export interface AgentHomeIsolationReport {
  readonly configPath: string;
  readonly configExists: boolean;
  readonly staleTrustEntries: readonly StaleTrustEntry[];
}

export function inspectAgentHomeIsolation(env: NodeJS.ProcessEnv = process.env): AgentHomeIsolationReport {
  const configPath = codexConfigPath(env);
  if (!existsSync(configPath)) {
    return { configPath, configExists: false, staleTrustEntries: [] };
  }

  try {
    return {
      configPath,
      configExists: true,
      staleTrustEntries: findStaleTrustEntries(readFileSync(configPath, 'utf8')),
    };
  } catch {
    // Unreadable is not a finding. Doctor reports what it can establish and never guesses at a
    // file it could not open.
    return { configPath, configExists: false, staleTrustEntries: [] };
  }
}
