import { ImplementationState } from "./implementationMachine.js";

/**
 * Nested workflow state for the repo, feature, task, and subtask layers.
 *
 * This is the state tree that the runtime keeps while it walks the loop.
 */
export interface SystemState {
  readonly requestPath?: string | undefined;
  readonly implementationState?: ImplementationState | undefined;
  readonly lastFeaturePath?: string | undefined;
  readonly currentFeaturePath?: string | undefined;
  readonly currentFeatureState?: FeatureState | undefined;
}

export interface FeatureState {
  readonly requestPath?: string | undefined;
  readonly implementationState?: ImplementationState | undefined;
  readonly lastTaskPath?: string | undefined;
  readonly currentTaskPath?: string | undefined;
  readonly currentTaskState?: TaskState | undefined;
}

export interface TaskState {
  readonly implementationState: ImplementationState;
  readonly lastSubtaskPath?: string | undefined;
  readonly currentSubtaskPath?: string | undefined;
  readonly currentSubtaskState?: SubtaskState | undefined;
}

export interface SubtaskState {
  readonly implementationState: ImplementationState;
}
