/**
 * Legacy umbrella re-export for the contract layer.
 *
 * New code should prefer the dedicated files under `actions/`, `adapters/`,
 * `state/`, `task/`, `planner/`, `reviewer/`, and `runtime/`.
 */
export * from "./task/workItem.js";
export * from "./task/taskContracts.js";
export * from "./planner/plannerContracts.js";
export * from "./reviewer/reviewerContracts.js";
export * from "./runtime/stepDecision.js";
export * from "./runtime/diagnosticAutocorrection.js";
export * from "./runtime/agentContext.js";
export * from "./runtime/protoRuntime.js";
export * from "./runtime/taskInterfaceAnalysis.js";
export * from "./runtime/attempts.js";
export * from "./state/featureStateSnapshot.js";
export * from "./state/projectState.js";
export * from "./state/projectStateSnapshot.js";
export * from "./state/workflowState.js";
export * from "./state/implementationMachine.js";
export * from "./doctor/doctorContracts.js";
export * from "./adapters/adapterContracts.js";
export * from "./actions/actionContracts.js";
