# State: Specification Flow

## Lifecycle State

implementation_running

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

- the structural narrowing: `request_pending` and `formalization_pending` are no longer startable, so the loop can no longer author a specification. It reports unspecified items by name and continues with what is validated.
- `listWorkItemsPendingSpecification()` and the session surfacing them before anything else -- the stage the old `brainstorm` command could not see at all, which is how eighteen requests accumulated here unnoticed.
- `specifyExistingRequest(id)`: the path a `request.md` takes to becoming a specification, reached from `/crear`. Same mechanism as before, different authority -- it runs because a human said so, and lands `validation: not_started` for that human to confirm.
- `/crear [id]`, handling both starting points a session has: an existing request folder, or an idea that exists only in the conversation.
- the per-session competency profile over three axes, asked once, held in memory, never written to any repository file. A second person opening a session declares their own and inherits nothing.
- `compassrose/DIMENSIONS.md`, its starter list written by `compassrose setup`, and the operations over it: a discard requires a reason and is refused without one; decisions append rather than overwrite, so reopening keeps the earlier one visible with its original author.
- `/cobertura`, `/descartar`, `/reabrir`, and the coverage report a session closes with -- uncovered and out-of-scope reported separately, because collapsing them is how a gap becomes invisible.
- `tests/specificationCoverage.test.ts`: 12 tests over the checklist and the profile.

### What the tests caught

Removing formalization from the loop broke four other tests, and each break was informative rather
than incidental. Three fixtures had been passing only because `request_pending` was startable --
they were missing `architecture.md` and had never actually been formalized. And two end-to-end
tests were driving formalization *through the loop*, which is precisely the capability this
feature removes; they now drive `specifyExistingRequest`, the same method `/crear` reaches.

Restructuring those two also surfaced a hazard the fixtures already warned about: the runner file
they write into the workspace, left uncommitted, appears in every later `git diff` -- including the
runtime's own review-time scope check, which filed a correction task against the item under test.

## Remaining Deliverables

- the structured-decision contract: presenting a real decision as concrete options with a recommendation, on an axis the human owns. The profile is threaded through the session but does not yet change how the agent converses.
- provenance in generated specifications: recording per section whether a human decided it or the agent filled it.
- agent-proposed dimensions during the conversation. The accept/discard machinery exists; what is missing is the agent proposing.
- marking a dimension covered when a feature that addresses it is drafted.

## Outline Progress

- 1. Detect and surface pending-specification items; remove formalization from the automated loop: complete
- 2. Add the per-session competency profile and thread it through the agent contracts: in progress
- 3. Add the structured-decision contract and its rendering in the session: not started
- 4. Add `DIMENSIONS.md`, its operations, and the session-close coverage report: complete
- 5. Record provenance in generated specifications and connect the cycle to the existing validation loop: in progress

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
