# Architecture: Automated Development Loop

## The Central Change: Outcome, Not Exit Code

`executeStep` currently returns `{ exitCode, continueLoop, summary }`, and `run()` treats any
non-zero exit code as fatal. That single conflation is the root of the stall: "this feature is
blocked" and "the engine is broken" are the same signal today.

The replacement is an explicit outcome:

```ts
type StepOutcome =
  | { readonly kind: 'advanced'; readonly summary: string }
  | { readonly kind: 'blocked'; readonly itemId: string; readonly blocker: BlockerProfile }
  | { readonly kind: 'failed'; readonly summary: string; readonly exitCode: number };
```

`run()` reacts to the kind, not to a number:

- `advanced` — record and continue
- `blocked` — record, set the item aside, and continue to the next selectable item
- `failed` — record, write the run summary, and stop

The set-aside is not new machinery. `inspectFeature`/`inspectFix` already report
`blocked_on_human`, and `isContinuingInspectionKind` already excludes it from re-selection. What is
missing is `run()` continuing at all after the block is persisted.

### What counts as `failed`

Deliberately narrow, because the whole point is to stop conflating things:

- an unhandled exception escaping a step
- a contract or schema validation failure in the runtime's own artifacts
- a dirty worktree where the policy requires a clean one
- a git operation failing
- a declared run limit reached (tasks per run)
- a configured adapter that cannot be invoked at all

Everything else that ends with a work item unable to proceed is `blocked`.

The process exit code preserves the distinction for non-interactive callers: `0` for a run that
ended with nothing selectable, a distinct non-zero code for `failed`, and a third for "ended
cleanly but items remain blocked" — so CI can tell "nothing to do" from "something needs a human"
from "the tool broke".

## Run Targeting

```ts
interface RunTarget { readonly itemId: string; }
```

Passed into the orchestrator for the run's lifetime. When present, `determineNextStep` filters
candidates to that item before applying the existing priority order, and returns a `stop` decision
naming why the target is not selectable if it is completed, blocked, awaiting specification, or
awaiting validation.

Targeting narrows selection; it never widens it. A target cannot make the loop work on something
the gates would otherwise refuse — notably, it cannot bypass the validation gate or resume a
`blocked_on_human` item.

## Automatic Completion

The gap this closes is documented in `002-configuration-model`'s own Known Gaps: an exhausted
outline currently produces only "formalize additional task requests", which is right when a task
request was genuinely forgotten and wrong when the work is actually finished. There is no path to
`completed`, and the only completed feature in the repository was marked by hand.

The new transition fires when, and only when, all of these hold:

1. every task request in the outline is `complete`
2. no active task, correction task, or unblock task is pending
3. the last quality gate result and the last review result are both passing
4. the specification's acceptance criteria are verified as met

Criteria verification is an agent call against a dedicated contract, returning a per-criterion
verdict with evidence, not a single boolean. Its output is written into the item's `state.md` as the
record of why it was closed. A criterion the agent cannot verify counts as unmet — the default is to
keep the item open, never to close it.

If criteria are unmet, the item is blocked with the unmet criteria as the reason and
`recoverability: 'human'`. This is a blocked outcome, so the run continues.

## Commit Batching

Today each step commits: planning, implementation, state updates, blocker records. The history reads
as pipeline telemetry rather than work.

The new unit is the approved task. Work accumulates in the worktree across a task's steps and is
committed once, when review approves it, with a message describing the change. The state-document
updates for that task are part of that same commit.

The constraint this must respect: several existing preconditions require a clean worktree between
steps, and the review diff is computed from the worktree. Both are satisfied by keeping the
accumulation inside a single task's lifetime and committing at its boundary — the boundary that
already exists, just used differently.

A blocked task still commits, because the evidence and state record must be durable; its message
says so plainly rather than wearing a `proto:` prefix.

## Selection Priority

Unchanged, and stated here because it is now load-bearing rather than incidental:

1. features already in flight (continuing inspection kinds)
2. fixes already in flight
3. startable fixes of `critical` or `high` severity
4. startable features, in numeric order
5. startable fixes of `medium` or `low` severity

Excluded from selection entirely: `completed`, `awaiting_validation`, `blocked_on_fix`,
`blocked_on_human`, and — new with `024-specification-flow` — items pending specification.

## End-of-Run Summary

A structured value rendered by `023-terminal-session` and printed plainly in non-interactive mode:

```ts
interface RunSummary {
  readonly completed: readonly string[];
  readonly advanced: readonly { readonly itemId: string; readonly tasks: number }[];
  readonly blocked: readonly { readonly itemId: string; readonly reason: string }[];
  readonly awaitingSpecification: readonly string[];
  readonly awaitingValidation: readonly string[];
  readonly failure: string | null;
}
```

Every item the run touched appears in exactly one bucket. An item that appears nowhere was not
selectable and not pending anything, which means it was already complete.

## Constraints

- No new runtime dependencies
- The loop never authors specification content
- The loop never re-selects a `blocked_on_human` item
- Acceptance-criteria verification defaults to "unmet" when uncertain
- Every bound (tasks per run, review iterations, correction depth) stays declared in configuration
