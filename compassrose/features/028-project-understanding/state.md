# State: Project Understanding

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

CompassRose can now be pointed at a repository it has never seen and state correctly what that
project is, without anyone typing it in. `compassrose setup` writes `PROJECT_FACTS.md` from what the
repository says about itself, and `/proyecto` refreshes it and shows the code inventory.

The inference half is there too. `/proyecto inferir` fills what no file states — what the project
is for, and which of its declared scripts are gates — and everything it produces enters as
`inferred`, below both `detected` and `confirmed`. `/proyecto confirmar` is the one operation that
raises a fact's provenance, and it takes a human's word.

## Implemented Deliverables

- gap inference (`inferProjectGaps`, `src/contracts/project/projectInference.ts`): one call, filling purpose, gate commands, and a start command. Never automatic — inference costs a call and produces something a human then has to check, so it happens when someone asks. Detection is free and runs on every `/proyecto`; guessing is neither.
- everything inferred enters as `inferred`. The existing precedence rule then does the rest: an inference cannot overwrite something read from a file or confirmed by a person, so the worst case for a wrong guess is a visibly-marked wrong guess rather than a corrupted fact.
- the call is shown what is already known *with its provenance*, so it neither restates nor contradicts it — an inference that knows the package manager was read from a file treats it differently from one that knows it was itself guessed last week.
- only `purpose` reaches `PROJECT_FACTS.md`. The two command lists are proposals for configuration, and writing them there would blur "what this repository is" with "how we have decided to work on it".
- `confirmProjectFact` and `/proyecto confirmar`: the one operation that raises a fact's provenance, on an explicit human action — ADR-0007's rule applied to knowledge rather than to lifecycle. It refuses a field nothing has recorded, because confirming an absent fact would invent one rather than promote one.
- everything unconfirmed is offered, *detected facts included*. Detection can be wrong about a repository with two package managers or a vestigial config, and only a person can say which one is real.
- `tests/projectInference.test.ts`: 8 tests, including that a confirmed purpose survives an inference that contradicts it.

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

- the inferred gate and start commands are shown and go no further. Putting them into `CONFIG.md` is left to the human, deliberately: a guess that rewrites the configuration the loop runs on is a guess with consequences, and the one thing this feature is shaped around is that a guess never acts like a fact. Wiring it would need its own confirmation step, which is `029`'s start-command proposal rather than this feature's.

## Outline Progress

- 1. Build the signal-based deterministic detector and the `ProjectFacts` model: complete
- 2. Record facts with provenance in `PROJECT_FACTS.md` and add the confirmation operation: complete
- 3. Add gap inference and its inferred-until-confirmed handling: complete
- 4. Build the code inventory and its grouping by apparent responsibility: complete
- 5. Hand the inventory to the specification conversation as candidate material: complete
- 6. Add signal-change re-detection and contradiction reporting: complete

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

Nothing outstanding here. Turning an inferred start command into a configured one belongs to `029`.
