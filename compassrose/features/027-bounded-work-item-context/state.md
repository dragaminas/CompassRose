# State: Bounded Work Item Context

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

Context assembly today is implicit: `src/orchestrator/promptBuilding.ts` builds each prompt from
whatever the calling site decides to include. Nothing declares the boundary, nothing measures the
size, and nothing records what an agent turned out to need but did not get.

The `context_overflow` classification exists in `src/orchestrator/implementationDiagnostics.ts` with
no mechanism behind it, so an oversized task fails at runtime after an implementation call has
already been paid for. Agent contexts are already logged to `logs/agent-contexts/`, which becomes the
verification surface for "the agent got exactly the manifest".

## Implemented Deliverables

- `ContextManifest` and `ManifestEntry` (`src/orchestrator/contextManifest.ts`). Every entry carries a mandatory `reason` -- the field that keeps a manifest from growing into "include all of `src/`" -- and an optional line range, because a 7,000-line file is not a context entry but a named range of it is.
- measurement in characters over the *assembled content*, so a manifest's measured size is exactly the size of what the agent receives. Characters rather than tokens deliberately: token counts differ per provider and would need a tokenizer dependency this project does not have.
- path normalization at the boundary. This codebase has already been bitten once by a Windows separator reaching a comparison that assumed POSIX; a manifest is a new comparison surface and takes the normalization rather than trusting callers.
- `limits.context_budget_characters`, optional, where absence means unbounded — a config predating the field is completely unaffected, matching ADR-0040.
- the planning-time budget check. This inverts the shape of the old failure: `context_overflow` used to be discovered by an implementer call that had already been paid for and had already half-written something. An oversized task now costs one planning call and is caught before any file is written, and is reported as "the task covers too much" rather than as a context problem.
- manifest construction for the implementer, and `promptBuilding.ts` reduced to rendering it. That function now has no authority to include anything the manifest does not name, which is the property that makes a run reproducible from its manifest.
- the exploration merge: files an earlier attempt read beyond its manifest are folded into that same task's next attempt, and never into a different task's -- which would let one task's reading silently inflate every later one.
- `tests/contextManifest.test.ts`: 15 tests over reading, measurement, the budget, and the growth asymmetry.

## Remaining Deliverables

- the implementer actually recording what it read beyond its manifest. The merge exists and is tested; what is missing is the adapter reporting it, which needs the implementer contract to ask for it.
- the declared exploration cap, enforced at the adapter layer.
- manifests for the planner and reviewer roles. They need different things from the same task -- the reviewer wants the diff and the acceptance criteria, not the implementer's prompt -- and only the implementer's is built today.
- removing implicit cross-task carry-over, and the required hand-off field naming what the next task needs to know.

## Outline Progress

- 1. Define the manifest type and its measurement: complete
- 2. Build manifests during task planning and drive prompt assembly from them: in progress
- 3. Add the budget, the planning-time check, and the replan-on-overflow path: complete
- 4. Add the exploration allowance, its record, and its carry into the next attempt: in progress
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
