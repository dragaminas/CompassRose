# State: Bounded Work Item Context

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

Context is declared and measured for all three roles, and it now flows in both directions. The
budget is checked at planning time, so an oversized task costs one planning call instead of an
implementation call that half-writes something. The implementer reports what it read beyond its
manifest, which is what finally feeds the exploration merge. And the one thing that used to cross a
task boundary implicitly -- a feature-wide history of recovery lessons -- no longer does; what needs
to cross now says so explicitly.

## Implemented Deliverables

- `ContextManifest` and `ManifestEntry` (`src/orchestrator/contextManifest.ts`). Every entry carries a mandatory `reason` -- the field that keeps a manifest from growing into "include all of `src/`" -- and an optional line range, because a 7,000-line file is not a context entry but a named range of it is.
- measurement in characters over the *assembled content*, so a manifest's measured size is exactly the size of what the agent receives. Characters rather than tokens deliberately: token counts differ per provider and would need a tokenizer dependency this project does not have.
- path normalization at the boundary. This codebase has already been bitten once by a Windows separator reaching a comparison that assumed POSIX; a manifest is a new comparison surface and takes the normalization rather than trusting callers.
- `limits.context_budget_characters`, optional, where absence means unbounded — a config predating the field is completely unaffected, matching ADR-0040.
- the planning-time budget check. This inverts the shape of the old failure: `context_overflow` used to be discovered by an implementer call that had already been paid for and had already half-written something. An oversized task now costs one planning call and is caught before any file is written, and is reported as "the task covers too much" rather than as a context problem.
- manifest construction for the implementer, and `promptBuilding.ts` reduced to rendering it. That function now has no authority to include anything the manifest does not name, which is the property that makes a run reproducible from its manifest.
- the exploration merge: files an earlier attempt read beyond its manifest are folded into that same task's next attempt, and never into a different task's -- which would let one task's reading silently inflate every later one.
- `tests/contextManifest.test.ts`: 15 tests over reading, measurement, the budget, and the growth asymmetry.

- manifests for the planner and reviewer, so every agent call the loop makes is now driven by one. Each is written to `.git/proto-compassrose/manifests/`, because "two runs of the same task against the same repository state produce identical manifests" is only checkable if the first run left one behind.
- the implementer's own report, parsed from its `## Implementation Notes` (`src/orchestrator/implementerReport.ts`): `Read beyond manifest:` and `Next task needs to know:`. Parsed from text rather than asked for in a structured call, for the same reason the notes themselves are: a second call to recover what the implementer already knows would double the cost of every implementation.
- the exploration cap, at ten paths. Its purpose is not to save bytes in the record — it is that every path reported lands in the *next* attempt's manifest, so an uncapped report is an uncapped manifest one attempt later. Exceeding it is reported rather than silently truncated: a task that had to read past its allowance is a task whose declared context was wrong, which is a planning defect.
- the hand-off, written into the feature's state document. That is the one place a later task genuinely reads — every manifest already names it — and a hand-off held anywhere else would be a fact the system depends on that lives outside the repository.
- `tests/implementerReport.test.ts`: 8 tests over both fields, the shapes an implementer actually writes, separator normalization, deduplication, and the cap.

### The carry-over that had to go

"No task receives a summary, transcript, or history of prior tasks" is an acceptance criterion, and
`buildRecoveryLessonPromptLines` violated it directly: up to five lessons drawn from *every task the
feature ever had*, replayed verbatim into every later planning, implementation, and review prompt.
It is now scoped to the task's own anchor. A correction or retry of the same task is not another
task's history; it is this one's own, which is what a lesson is for.

Four tests in `recoveryLessonsWiring.test.ts` asserted the old behavior by name — "surfaces lessons
from unrelated task anchors" was the point of one of them. They were rewritten to pin the boundary
from the other side rather than deleted, because the boundary is still worth pinning.

## Remaining Deliverables

- the planner's manifest carries four entries preserved verbatim from the hand-written block it replaced: `src/config/`, `src/doctor/`, `tests/`, and `src/cli/main.ts`. Two defects in one. A directory measures as zero characters, so it is declared without being bounded — which weakens the budget for exactly the entries most likely to be large. And all four name **this repository's own layout** inside a prompt any project's planner receives, which is a self-hosting leak. Kept rather than quietly narrowed: dropping them changes what a planner can see, which is a change to planning quality, not to context bookkeeping.
- the reviewer's manifest deliberately includes the implementer's own recorded context. That looks like exactly what a bounded reviewer should not have, and it is there for a stated reason — without it the reviewer cannot tell "the implementer failed" from "the implementer was given too little", and those need different outcomes. Worth revisiting as a product decision, not as a bug.

## Outline Progress

- 1. Define the manifest type and its measurement: complete
- 2. Build manifests during task planning and drive prompt assembly from them: complete
- 3. Add the budget, the planning-time check, and the replan-on-overflow path: complete
- 4. Add the exploration allowance, its record, and its carry into the next attempt: complete
- 5. Remove implicit cross-task carry-over and require written hand-off facts: complete

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

Narrow the planner's manifest: three of its entries are directories, which are declared without being measurable, and all four name this repository's own layout rather than the target project's.
