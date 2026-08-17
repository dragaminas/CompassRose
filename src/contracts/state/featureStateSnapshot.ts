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
  /**
   * 'not_started' | 'confirmed' -- whether a human has confirmed this feature's formalized
   * definition through "npm run feature-validation" (see ADR-0046/Flow 1). A freshly-formalized
   * feature/fix always has this explicitly written as 'not_started' by
   * planFeature()/planFixRequest(); it defaults to 'confirmed' only when genuinely absent (a
   * state.md formalized before this field existed), so pre-existing work is never retroactively
   * blocked -- matching ADR-0040/41's precedent.
   */
  readonly validationStatus: string;
}
