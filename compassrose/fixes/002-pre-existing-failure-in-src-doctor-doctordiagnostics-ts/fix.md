# Fix: Pre-existing failure in `src/doctor/doctorDiagnostics.ts`

## Status

Completed

## Severity

high

## Owning Feature

none

## Purpose

Repair the blocking defect: Pre-existing failure in `src/doctor/doctorDiagnostics.ts`.

## Problem

`npm test` fails on a clean checkout of the repository, unrelated to any task currently in progress. Referenced path(s): `src/doctor/doctorDiagnostics.ts`, `tests/doctor/doctorDiagnostics.test.ts`, `tests/orchestratorScopeGuard.test.ts`, `tests/featurePlanningOutline.test.ts`, `tests/taskRequestBackfill.test.ts`, `feature.md`, `tests/taskRequestScopeEnforcement.test.ts`, `tests/protoBlockerFlows.test.ts`, `README.md`, `docs/compassrose/CONFIG.md`, `docs/compassrose/PROJECT_STATE.md`, `docs/features/fixture-feature/tasks/001-fixture-task.md`, `src/allowed.ts`, `src/contracts/README.md`, `src/contracts/adapters/adapterContracts.ts`, `src/contracts/adapters/adapterShared.ts`, `src/contracts/adapters/implementer-adapter.md`, `src/contracts/adapters/implementerAdapterContracts.ts`, `src/contracts/adapters/planner-adapter.md`, `src/contracts/adapters/plannerAdapterContracts.ts`, `src/contracts/adapters/reviewer-adapter.md`, `src/contracts/adapters/reviewerAdapterContracts.ts`, `src/contracts/doctor/doctorContracts.ts`, `src/contracts/implementer/task-execution-prompt.md`, `src/contracts/planner/doctor-recovery-planning-prompt.md`, `src/contracts/planner/feature-output.schema.js`, `src/contracts/planner/feature-planning-prompt.md`, `src/contracts/planner/feature-scope-guard.md`, `src/contracts/planner/fix-output.schema.js`, `src/contracts/planner/fix-planning-prompt.md`, `src/contracts/planner/input.md`, `src/contracts/planner/output.md`, `src/contracts/planner/output.schema.js`, `src/contracts/planner/plannerContracts.ts`, `src/contracts/planner/task-planning-prompt.md`, `src/contracts/planner/task-requests-backfill-output.schema.js`, `src/contracts/planner/unblock-task-planning-prompt.md`, `src/contracts/reviewer/correction-task-prompt.md`, `src/contracts/reviewer/input.md`, `src/contracts/reviewer/output.md`, `src/contracts/reviewer/output.schema.js`, `src/contracts/reviewer/review-prompt.md`, `src/contracts/reviewer/reviewerContracts.ts`, `src/contracts/runtime/agent-context.md`, `src/contracts/runtime/agentContext.ts`, `src/contracts/runtime/attempts.ts`, `src/contracts/runtime/diagnostic-autocorrection.md`, `src/contracts/runtime/diagnostic-autocorrection.schema.js`, `src/contracts/runtime/diagnosticAutocorrection.ts`, `src/contracts/runtime/doctor-recovery-execution-prompt.md`, `src/contracts/runtime/operation-loop.md`, `src/contracts/runtime/protoRuntime.ts`, `src/contracts/runtime/stepDecision.ts`, `src/contracts/runtime/task-interface-analysis.md`, `src/contracts/runtime/task-interface-analysis.schema.js`, `src/contracts/runtime/taskInterfaceAnalysis.ts`, `src/contracts/runtime/work-item-taxonomy.md`, `src/contracts/state/feature-state.md`, `src/contracts/state/featureStateSnapshot.ts`, `src/contracts/state/projectState.ts`, `src/contracts/state/projectStateSnapshot.ts`, `src/contracts/task/correction-task.md`, `src/contracts/task/doctor-recovery-task.md`, `src/contracts/task/state-correction-task.md`, `src/contracts/task/task.md`, `src/contracts/task/taskContracts.ts`, `src/contracts/task/unblock-task.md`, `src/contracts/task/workItem.ts`, `src/contracts/types.ts`, `docs/features/fixture-feature/state.md`, `docs/features/fixture-feature/tasks/001-fixture-previous-task.md`, `docs/features/fixture-feature/architecture.md`, `docs/features/fixture-feature/feature.md`, `keep.md`.

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

## Resolution

The root cause was a stale, per-test `20000`ms timeout override in five test files
(`tests/taskRequestScopeEnforcement.test.ts`, `tests/orchestratorScopeGuard.test.ts`,
`tests/taskRequestBackfill.test.ts`, `tests/featurePlanningOutline.test.ts`,
`tests/protoControlledStop.test.ts`) that undercut `vitest.config.ts`'s own global
`testTimeout: 30000`, already raised specifically to accommodate these subprocess-spawning
e2e-style tests under full-suite contention. Removing the stale overrides (commit
`242670b6`) let them inherit the safe default; `npm test` now passes cleanly and
repeatedly (471/472, one pre-existing skip, 0 failures across multiple full-suite runs).

Fixed directly, out of band, rather than through this fix's own task chain: the
originally-filed request misattributed the failure to `src/doctor/doctorDiagnostics.ts`
(a file that never existed -- an artifact of `blockOnUnrelatedFixFailure`'s
`referencedPaths[0]` heuristic picking up an unrelated, coincidentally-touched path from
a noisy match list instead of the actual failing test files). Every subsequent task
attempt (`FX002-T01`) and review correctly confirmed there was nothing to repair inside
that misattributed scope, and doctor recovery could only ever narrow the task's *wording*
(`FX002-T02`, `FX002-T04`, `FX002-T05`, `FX002-T06`), never its fundamentally wrong file
scope -- so the implement -> review-blocked -> doctor-recovery cycle would have repeated
indefinitely. See this fix's own `state.md` Known Gaps and
`docs/compassrose/PROJECT_STATE.md` Known Gaps for the underlying runtime limitation.

## Related Documents

- `state.md`
