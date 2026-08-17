# State: 001-blocked-feature-scope-misclassification

## Lifecycle State

completed

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: not_run
- last_unblock_result: not_run
- severity: medium
- owning_feature: none

## Current Reality

Implemented directly (see `docs/REFACTOR_PLAN.md` item 6): `buildBlockerProfile`, `recordBlockedFeature`, and `persistBlockedFeature` (`src/orchestrator/orchestrator.ts`) now accept an optional explicit `{ kind, nextPlanningHint }` pair. `blockIfBelongsToOtherFeature` (the sibling-feature-scope path, shared by both `planTaskFreely` and `planTaskFromRequest` -- covering the "equivalent formalization-time sibling path" too) and `planTask`'s exhausted-task-request branch now supply it explicitly instead of leaving `classifyBlockerKind` to reconstruct it from `reason` text. `classifyBlockerKind` remains the unchanged fallback for every other call site.

## Implemented Deliverables

- Fix scope, severity, transversal ownership, acceptance criteria, deliverables, completion criteria, and implementation outline have been formalized.
- Explicit blocker-kind and next-planning-hint inputs added to the blocker recording/persistence path (`recordBlockedFeature`/`persistBlockedFeature`/`buildBlockerProfile`), with fallback classification retained unchanged for callers that don't supply them.
- Sibling-feature scope, exhausted-task-request, and the shared formalization-time sibling path all supply deterministic metadata now.
- Regression coverage added (`tests/blockedFeatureScopeMisclassification.test.ts`) for both reported cases and the fallback path; existing `tests/orchestratorScopeGuard.test.ts` e2e coverage still passes unchanged.
- Configured typecheck and test quality gates pass (full suite: 536 passed, 1 skipped).

## Remaining Deliverables

- None.

## Outline Progress

- Define the explicit blocker metadata contract with fallback classification: complete
- Update deterministic blocker call sites: complete
- Add regression coverage and run configured validation: complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Explicit blocker-kind and next-planning-hint recording implemented for both reported cases, verified by regression tests and the full test suite.

## Known Gaps

- Both fixed call sites use `task_interface_gap` as the explicit kind (the closest existing fit: a missing/unsatisfied task-interface declaration for this feature). The request didn't mandate a specific literal, and no new `BlockerKind` value was introduced -- adding one would also require updating every JSON schema that enumerates the full kind set (`diagnostic-autocorrection.schema.json`, `blocker-kind-classification.schema.json`), which was judged out of this fix's narrow scope.

## Next Planning Hint

None; this fix is complete.
