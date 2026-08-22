# State: Bounded Work Item Context

## Lifecycle State

formalized

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run
- validation: confirmed

## Current Reality

Specified jointly with the user in the specification round of 2026-08-22; every product and
architecture decision in `feature.md` and `architecture.md` was made by the user, with contracts,
schemas, and implementation detail filled in by the agent.

Context assembly today is implicit: `src/orchestrator/promptBuilding.ts` builds each prompt from
whatever the calling site decides to include. Nothing declares the boundary, nothing measures the
size, and nothing records what an agent turned out to need but did not get.

The `context_overflow` classification exists in `src/orchestrator/implementationDiagnostics.ts` with
no mechanism behind it, so an oversized task fails at runtime after an implementation call has
already been paid for. Agent contexts are already logged to `logs/agent-contexts/`, which becomes the
verification surface for "the agent got exactly the manifest".

## Implemented Deliverables

- None

## Remaining Deliverables

- Every deliverable listed in `feature.md`.

## Outline Progress

- 1. Define the manifest type and its measurement: not started
- 2. Build manifests during task planning and drive prompt assembly from them: not started
- 3. Add the budget, the planning-time check, and the replan-on-overflow path: not started
- 4. Add the exploration allowance, its record, and its carry into the next attempt: not started
- 5. Remove implicit cross-task carry-over and require written hand-off facts: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Formalized and validated in the specification round of 2026-08-22.

## Known Gaps

- None recorded yet; this feature has not been implemented.

## Next Planning Hint

Define the manifest type and its measurement first; every other part of this feature is downstream of having something to measure.
