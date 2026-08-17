/**
 * Compact runtime snapshot of `compassrose/PROJECT_STATE.md`.
 *
 * This stays deliberately small and flexible because the project state is a
 * human-reviewable summary, not a rigid database record.
 */
export interface ProjectStateSnapshot {
  readonly status: string;
  readonly activeFeature: string | null;
  readonly currentReality: readonly string[];
  readonly implemented: readonly string[];
  readonly pending: readonly string[];
  readonly blocked: readonly string[];
  readonly lastApprovedChange: string | null;
  readonly knownGaps: readonly string[];
  readonly nextPlanningHint: string | null;
  readonly roadmapProgress?: readonly string[] | undefined;
  readonly knownFeatures?: readonly string[] | undefined;
  readonly implementedCapabilities?: readonly string[] | undefined;
  readonly pendingCapabilities?: readonly string[] | undefined;
  readonly knownArchitectureReality?: readonly string[] | undefined;
  readonly currentLimitations?: readonly string[] | undefined;
}
