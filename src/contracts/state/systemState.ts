/**
 * Compatibility facade for workflow, implementation-state, and project-state contracts.
 *
 * Prefer the dedicated files in `state/` when you need a specific part of the
 * state model.
 */
export * from "./implementationMachine.js";
export * from "./workflowState.js";
export * from "./featureStateSnapshot.js";
export * from "./projectState.js";
export * from "./projectStateSnapshot.js";
