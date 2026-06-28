# Contracts Map

This folder contains the TypeScript contract layer for CompassRose.

The purpose of these files is to keep the runtime vocabulary explicit while
keeping the Markdown contracts readable for humans.

## How To Read It

- Start with the dedicated file for the responsibility you need.
- Use the facades only for compatibility or broad imports.
- Prefer the smallest contract that matches the responsibility.

## Files

- `actions/actionContracts.ts`: action kinds, action contexts, `SystemAction`, and action factory/executor shapes.
- `state/implementationMachine.ts`: durable implementation states, events, and transition maps.
- `state/workflowState.ts`: nested repo/feature/task/subtask runtime state.
- `state/featureStateSnapshot.ts`: compact feature snapshot used by runtime diagnostics.
- `state/projectState.ts`: parsed project-state document and validator for `docs/compassrose/PROJECT_STATE.md`.
- `state/projectStateSnapshot.ts`: compact project-state snapshot for `docs/compassrose/PROJECT_STATE.md`.
- `doctor/doctorContracts.ts`: doctor command input and output shapes.
- `adapters/adapterShared.ts`: shared adapter envelope fields.
- `adapters/plannerAdapterContracts.ts`: planner adapter input and output shapes.
- `adapters/reviewerAdapterContracts.ts`: reviewer adapter input and output shapes.
- `adapters/implementerAdapterContracts.ts`: implementer adapter input and output shapes.
- `adapters/adapterContracts.ts`: compatibility facade for all adapter contracts.
- `task/workItem.ts`: shared planning vocabulary for work items.
- `task/taskContracts.ts`: task artifacts, recovery metadata, parsed task documents, and state-correction task shapes.
- `planner/plannerContracts.ts`: planner input, planned feature docs, and planner output.
- `reviewer/reviewerContracts.ts`: reviewer input, statuses, findings, and review output.
- `runtime/diagnosticAutocorrection.ts`: blocker diagnostics and the bounded recovery decision.
- `runtime/agentContext.ts`: logged agent invocation context, tool snapshot, workspace snapshot, and configuration snapshot.
- `runtime/protoRuntime.ts`: proto runtime options, feature inventory records, feature inspections, step run records, and run summaries.
- `runtime/agent-context.md`: human-readable description of the logged agent invocation context.
- `runtime/taskInterfaceAnalysis.ts`: review-time task-interface analysis and recovery lessons.
- `runtime/attempts.ts`: implementation attempts, diagnostic results, and refinement feedback.
- `runtime/stepDecision.ts`: coarse step-selection records.

## Facades

- `actions/actions.ts`: compatibility facade for the action contracts.
- `state/systemState.ts`: compatibility facade for the workflow and implementation-state contracts.
- `types.ts`: legacy umbrella re-export for most contract types.
