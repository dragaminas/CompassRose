/**
 * The one quality gate CompassRose injects into a task rather than reading from it -- and the one
 * that only means anything in this repository.
 *
 * vitest tolerates CommonJS-style `require()` inside an ESM module through its own CJS interop; a
 * real ESM loader does not (see `scripts/runtimeSmokeTest.mjs`, which imports `src/cli/main.ts` --
 * and therefore its whole transitive module graph -- under tsx's real loader). That gap let a
 * `require('node:fs')` regression pass every vitest-based gate and crash the real CLI, so this
 * closes it without relying on any task author, human or otherwise, to remember to ask for it.
 *
 * It is pure, and takes `selfHosted` rather than deciding it, for the same reason
 * `codexSandboxArguments` is pure (ADR-0048): what commands a run is about to execute in someone's
 * repository is worth asserting directly, not through a spawn.
 *
 * The prefixes and the script are this repository's own layout. Injecting them into a run aimed at
 * another repository handed that project a gate invoking a script it does not have, through a `tsx`
 * it has not installed -- recorded as a self-hosting leak under 030-execution-trust and closed by
 * ADR-0049. Closed, not deleted: the gate is worth exactly what it was worth, in the one repository
 * it means anything for.
 */
import { isPathAllowedByPrefix } from '../shared/pathPrefix.js';

const CORE_RUNTIME_PREFIXES: readonly string[] = ['src/orchestrator/', 'src/cli/', 'src/task/'];

export const CORE_RUNTIME_SMOKE_GATE_COMMAND = 'npx tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts';

export function coreRuntimeSmokeGateCommands(
  changedFiles: readonly string[],
  selfHosted: boolean,
): readonly string[] {
  if (!selfHosted) {
    return [];
  }

  const touchesCoreRuntime = changedFiles.some((path) => isPathAllowedByPrefix(path, CORE_RUNTIME_PREFIXES));
  return touchesCoreRuntime ? [CORE_RUNTIME_SMOKE_GATE_COMMAND] : [];
}
