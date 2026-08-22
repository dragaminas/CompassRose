# State: Specification Flow

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

Substantial parts already exist and are extended rather than replaced: `src/cli/brainstorm.ts`
(conversational loop, keyword discipline, bootstrap check), `src/cli/validationLoop.ts` (validation
rounds and the `listo` confirmation), `src/contracts/brainstormer/`, and the orchestrator operations
`draftBrainstormedFeature`, `confirmFeatureValidation`, and `listFeaturesAwaitingValidation`.

What is missing is everything the round identified as the gap: pending-*specification* detection
(today only pending *validation* is surfaced), the per-session competency profile, structured
decisions, the dimensions checklist, and removing the automated loop's authority to author
specifications at all.

## Implemented Deliverables

- None

## Remaining Deliverables

- Every deliverable listed in `feature.md`.

## Outline Progress

- 1. Detect and surface pending-specification items; remove formalization from the automated loop: not started
- 2. Add the per-session competency profile and thread it through the agent contracts: not started
- 3. Add the structured-decision contract and its rendering in the session: not started
- 4. Add `DIMENSIONS.md`, its operations, and the session-close coverage report: not started
- 5. Record provenance in generated specifications and connect the cycle to the existing validation loop: not started

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

Start by removing formalization from the automated loop and surfacing pending-specification items, since every other part of this feature assumes specification is a conversation.
