# State: Specification Flow

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
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

- the specification audit (`auditSpecificationDecisions`, `specification-audit.schema.json`), which closes the one claim in this feature nothing could enforce. The contract asks the agent to surface a decision when a real choice arises on an axis the human owns, and at the moment of the turn there is nothing to check: a turn that quietly decided produces `decision: null` and a good reply, which is exactly what a turn where nothing forked produces.
- the way out is to stop asking at the turn, where the omission leaves no artifact, and ask at `/crear`, where two exist — the drafted specification and the transcript. "This document asserts X and nobody ever said X" is a detectable absence; "the model should have asked" is not.
- what it finds is recorded in the provenance section as **its own list**, separate from the decisions taken in conversation. Both are the agent's, but "you were asked and declined" and "you were never asked" are different facts about a document, and the second is the one worth being able to find later.
- scoped to axes the human owns, and filtered again on this side: the schema permits all three, and a claim on an axis the agent owns would accuse it of doing exactly what it was told to do. A session where the human owns no axis skips the call entirely.
- capped at ten. Not for size: a provenance section listing forty unchosen commitments is one nobody reads, and a draft with forty of them does not need a longer list.
- the structured-decision contract (`StructuredDecision`, `RecordedDecision`): a question, two to four options each stating **what it commits the project to** rather than restating its label, the axis it sits on, and an optional recommendation. The competency profile now reaches the brainstormer prompt, which is what finally makes declaring it mean something — until now it was a fact the session held and nobody acted on.
- the recommendation is *marked*, never pre-selected. A recommendation the human actively accepts leaves a record of a human choosing; a default they have to actively reject does not.
- declining is an answer, and a different one: the agent's own pick is recorded as `decided_by: agent`. "The human chose the second option" and "nobody was asked and the agent chose the second option" produce identical specification text and are not the same fact about it.
- the answer is written back into the transcript as a human turn, which is how it reaches both the next turn and the drafted specification. Nothing is carried in memory that is not also written down.
- `## Provenance` on the drafted specification: which axes the session's author owned, and every decision taken with who gave it.
- agent-proposed dimensions (`proposed_dimension`, `proposeDimension`). The same asymmetry as a context manifest: the agent may grow a declared floor, never replace one, and never without a keystroke. A proposal enters `uncovered` with the reason attached, because proposing a dimension and covering it are two different acts.
- `/crear` closes the loop: provenance written, then the uncovered dimensions offered so the human can say which this feature closes. Asked rather than inferred — which dimension a feature covers is a judgment about scope, and guessing would put the agent's opinion into a document whose whole value is that a human decided it.
- `tests/structuredDecision.test.ts`: 10 tests over the rendering, the provenance section, and the proposal path.

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

- provenance is recorded per *specification*, not per section. A section-level marker would have to be regenerated by whatever rewrites that section, and a provenance claim that silently survives a rewrite is worse than none — so the appended section is the honest version of this, and the per-section reading in `feature.md` is not met as literally written.
- the audit reports; nothing acts on what it finds. A specification with five unchosen commitments enters validation exactly like one with none, and the only difference is that the human can now see them. Making the count gate anything would be a state transition decided by a model's judgment, which ADR-0007 forbids — so if this should block, it should block on a human reading the list, and that is a different design than a threshold.
- the audit costs one call per `/crear`, and it is not skippable except by owning no axis. On a session that drafts several features, that is several calls whose usual honest answer is an empty list.

## Outline Progress

- 1. Detect and surface pending-specification items; remove formalization from the automated loop: complete
- 2. Add the per-session competency profile and thread it through the agent contracts: complete
- 3. Add the structured-decision contract and its rendering in the session: complete
- 4. Add `DIMENSIONS.md`, its operations, and the session-close coverage report: complete
- 5. Record provenance in generated specifications and connect the cycle to the existing validation loop: complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none

## Last Approved Change

Formalized and validated in the specification round of 2026-08-22.

## Known Gaps

- Everything listed under Remaining Deliverables above is a known gap; nothing else has surfaced.

## Next Planning Hint

Nothing outstanding that changes what the feature does. What is left is a judgment call recorded
under Remaining Deliverables: whether a specification carrying unchosen commitments should be
allowed to enter validation as freely as one that carries none, and if not, what human action gates
it — a threshold decided by a model is exactly what ADR-0007 forbids.

`compassrose/DIMENSIONS.md` now exists in this repository. It had never been written, so
`readDimensions` fell back to the starter floor and told the brainstormer on every turn that nothing
was covered — contradicting the coverage report in `features/README.md`. The nine dimensions that
report says were covered are **not** reconstructed there: it names none of them, and inventing the
mapping would write a guess into the project's history as if it were the round's, which is the
precise failure this feature's audit exists to catch. Walking `/cobertura` once is a human action.
