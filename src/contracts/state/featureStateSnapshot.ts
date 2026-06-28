import type { RestorationTarget } from "../task/taskContracts.js";

/**
 * Compact runtime snapshot of a feature state document.
 *
 * This is the read-only shape the runtime can use when it needs to reason
 * about a feature without parsing the whole Markdown file again.
 */
export interface FeatureStateSnapshot {
  readonly lifecycleState: string;
  readonly activeTask: string;
  readonly activeCorrectionTask: string;
  readonly activeUnblockTask: string;
  readonly blockedBy: readonly string[];
  readonly blockedFrom: RestorationTarget | null;
}
