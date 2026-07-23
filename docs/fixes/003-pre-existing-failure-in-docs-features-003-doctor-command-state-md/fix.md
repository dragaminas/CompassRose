# Fix: Pre-existing failure in `docs/features/003-doctor-command/state.md`

## Status

Planned

## Severity

high

## Owning Feature

none

## Purpose

Repair the blocking defect: Pre-existing failure in `docs/features/003-doctor-command/state.md`.

## Problem

`npm test` fails on a clean checkout of the repository, unrelated to any task currently in progress. Referenced path(s): `docs/features/003-doctor-command/state.md`, `src/doctor/doctorDiagnostics.ts`, `tests/doctor/doctorDiagnostics.test.ts`, `tests/protoBlockerFlows.test.ts`, `README.md`, `docs/compassrose/CONFIG.md`, `docs/compassrose/PROJECT_STATE.md`, `docs/features/fixture-feature/architecture.md`, `docs/features/fixture-feature/feature.md`, `docs/features/fixture-feature/state.md`, `docs/features/fixture-feature/tasks/001-fixture-task.md`, `src/allowed.ts`, `src/contracts/README.md`, `src/contracts/adapters/adapterContracts.ts`, `src/contracts/adapters/adapterShared.ts`, `src/contracts/adapters/implementer-adapter.md`, `src/contracts/adapters/implementerAdapterContracts.ts`, `src/contracts/adapters/planner-adapter.md`, `src/contracts/adapters/plannerAdapterContracts.ts`, `src/contracts/adapters/reviewer-adapter.md`, `src/contracts/adapters/reviewerAdapterContracts.ts`, `src/contracts/doctor/doctorContracts.ts`, `src/contracts/implementer/task-execution-prompt.md`, `src/contracts/planner/doctor-recovery-planning-prompt.md`, `src/contracts/planner/feature-output.schema.js`, `src/contracts/planner/feature-planning-prompt.md`, `src/contracts/planner/feature-scope-guard.md`, `src/contracts/planner/fix-output.schema.js`, `src/contracts/planner/fix-planning-prompt.md`, `src/contracts/planner/input.md`, `src/contracts/planner/output.md`, `src/contracts/planner/output.schema.js`, `src/contracts/planner/plannerContracts.ts`, `src/contracts/planner/task-planning-prompt.md`, `src/contracts/planner/task-requests-backfill-output.schema.js`, `src/contracts/planner/unblock-task-planning-prompt.md`, `src/contracts/reviewer/correction-task-prompt.md`, `src/contracts/reviewer/input.md`, `src/contracts/reviewer/output.md`, `src/contracts/reviewer/output.schema.js`, `src/contracts/reviewer/review-prompt.md`, `src/contracts/reviewer/reviewerContracts.ts`, `src/contracts/runtime/agent-context.md`, `src/contracts/runtime/agentContext.ts`, `src/contracts/runtime/attempts.ts`, `src/contracts/runtime/diagnostic-autocorrection.md`, `src/contracts/runtime/diagnostic-autocorrection.schema.js`, `src/contracts/runtime/diagnosticAutocorrection.ts`, `src/contracts/runtime/doctor-recovery-execution-prompt.md`, `src/contracts/runtime/operation-loop.md`, `src/contracts/runtime/protoRuntime.ts`, `src/contracts/runtime/stepDecision.ts`, `src/contracts/runtime/task-interface-analysis.md`, `src/contracts/runtime/task-interface-analysis.schema.js`, `src/contracts/runtime/taskInterfaceAnalysis.ts`, `src/contracts/runtime/work-item-taxonomy.md`, `src/contracts/state/feature-state.md`, `src/contracts/state/featureStateSnapshot.ts`, `src/contracts/state/projectState.ts`, `src/contracts/state/projectStateSnapshot.ts`, `src/contracts/task/correction-task.md`, `src/contracts/task/doctor-recovery-task.md`, `src/contracts/task/state-correction-task.md`, `src/contracts/task/task.md`, `src/contracts/task/taskContracts.ts`, `src/contracts/task/unblock-task.md`, `src/contracts/task/workItem.ts`, `src/contracts/types.ts`, `docs/features/fixture-feature/tasks/001-fixture-previous-task.md`, `keep.md`.

## Scope

This fix includes:

- Diagnosing and repairing the root cause of `npm test` failing.

This fix does not include:

- Any work belonging to the task that first surfaced this failure; that task is unrelated and unblocks automatically once this fix reaches `completed`.

## Acceptance Criteria

- `npm test` passes on a clean checkout of the repository.

## Implementation Deliverables

- A code or configuration change that repairs the root cause.

## Completion Criteria

This fix is considered resolved when:

- `npm test` passes cleanly, and every feature/fix blocked on this fix id can resume.

## Implementation Outline

1. Diagnosing and repairing the root cause of `npm test` failing.

## Related Documents

- `state.md`
