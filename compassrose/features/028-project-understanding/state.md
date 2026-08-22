# State: Project Understanding

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

Nothing exists. This is the only one of the original twenty-two requests with no implementation at
all, and the absence shows: everything CompassRose knows about a project comes from what a human
typed into `compassrose/CONFIG.md` at setup, which works for this repository and for no other.

## Implemented Deliverables

- the signal registry (`src/project/detectProject.ts`): a table of files, each row a pure function from one file's contents to facts, independently testable with a fixture. Fourteen rows covering Node, TypeScript, Python, Go, Rust, Java, Ruby, and PHP. Adding language support means adding a row, and nothing in it calls an AI.
- `ProjectFacts` with per-fact provenance, and the precedence rule the whole feature turns on: **confirmed outranks detected outranks inferred**. A later detection never overwrites a confirmation; it raises a contradiction and waits.
- `compassrose/PROJECT_FACTS.md`, written by `compassrose setup` and refreshable from a session. Reading it answers "does CompassRose actually know this, or did it guess?" without running anything.
- signal fingerprinting and change reporting, so re-detection only runs on the rows whose signal actually moved.
- quality-gate and start-command candidate derivation from declared scripts -- proposed, never written, because configuration stays human-owned. Which of `test` and `test:unit` is *the* gate is a judgment, and this only narrows the field.
- the code inventory, grouped by directory with entry points named. Computed on demand and never stored: an inventory of a moving codebase is stale by definition and would become another document nobody trusts.
- `/proyecto` in the session, which marks each fact by how it is known and offers the inventory explicitly as material for a conversation.
- `tests/projectUnderstanding.test.ts`: 19 tests, including that a confirmed fact survives a disagreeing detection and that a detection does replace an inference.

### The boundary that makes this honest

Detection establishes everything a file states, which leaves inference a deliberately narrow set:
what the project is *for*, which of several plausible commands is the real gate, and the apparent
responsibility of a module group. Inference may never produce a fact the registry could have
established -- otherwise "inferred" quietly spreads to cover things nobody needed to guess about.

And the constraint separating the accepted design from the rejected one: the inventory is input to
a *conversation*, never to a formalizer. There is no code path from it to a `feature.md`. The path
runs inventory → conversation → human decision → `024-specification-flow`.

## Remaining Deliverables

- gap inference itself: the AI call that fills purpose and picks among gate candidates, marked inferred until confirmed. The provenance model, the document, and the precedence rule are all in place for it; what is missing is the call.
- the confirmation operation surfaced in the session, so a human can turn an inferred fact into a confirmed one.

## Outline Progress

- 1. Build the signal-based deterministic detector and the `ProjectFacts` model: complete
- 2. Record facts with provenance in `PROJECT_FACTS.md` and add the confirmation operation: in progress
- 3. Add gap inference and its inferred-until-confirmed handling: not started
- 4. Build the code inventory and its grouping by apparent responsibility: complete
- 5. Hand the inventory to the specification conversation as candidate material: complete
- 6. Add signal-change re-detection and contradiction reporting: complete

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

Build the deterministic detector first. It is pure, testable with fixtures, and requires no AI call -- and it establishes most of the facts, leaving inference a narrow role.
