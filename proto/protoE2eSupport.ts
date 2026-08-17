import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Removes every `docs/features/*` entry from a disposable clone except the ones a scenario
 * explicitly declares it depends on (see ADR-0034/ADR-0035).
 *
 * A clone produced by `git clone` of this repository inherits every feature directory as of the
 * cloned ref, including features the scenario never seeds or asserts on. determineNextStep()
 * scans features in id order and returns the first one sitting in a "continuing" (non-terminal)
 * lifecycle state -- so whenever some other, unrelated feature is itself mid-flight (as happens
 * routinely in this self-hosted repository), the orchestrator running inside the clone can pick
 * that feature up instead of the scenario's actual target, and the scenario's own assertions fail
 * or hang for a reason that has nothing to do with what it was testing.
 *
 * Call this immediately after cloning, before any scenario-specific seeding, so every later step
 * builds on a clone that already contains exactly the declared features and nothing inherited.
 */
export function isolateFeatureDirectories(cloneRoot: string, allowedFeatureIds: readonly string[]): void {
  const featuresRoot = join(cloneRoot, 'docs', 'features');
  if (!existsSync(featuresRoot)) {
    return;
  }

  for (const entry of readdirSync(featuresRoot)) {
    const entryPath = join(featuresRoot, entry);
    if (!allowedFeatureIds.includes(entry) && statSync(entryPath).isDirectory()) {
      rmSync(entryPath, { recursive: true, force: true });
    }
  }
}
