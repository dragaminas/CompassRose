# Request: Blocked-feature recovery hints are misrouted when the call site already knows the real cause

When the orchestrator blocks a feature for a reason it already understands precisely — the
proposed task belongs to a sibling feature, or every pre-declared task request is already
consumed — the resulting block should point whoever recovers it toward the actual right action.
Instead, in both cases seen so far, it gets routed toward planning a doctor-recovery task, which
is the wrong kind of recovery for either situation.

## Root cause

`classifyBlockerKind` (`src/state/blockerClassification.ts`) reclassifies every blocker by
running a set of regexes over the block's own free-text reason string — it doesn't know the
blocker's real kind from the call site that raised it, only what it can pattern-match after the
fact. `recoverability` then defaults to `'agent'` (only the `environment` kind maps to
`'human'`/`'terminal'`), so nearly everything looks routinely auto-recoverable via
doctor-recovery, even when the actual right move is something else entirely. Two concrete
instances of this, both real, both from this repository:

### Instance A: sibling-feature scope block

Task planning for `002-configuration-model` proposed "Bound correction-task ID allocation,"
which the planner correctly identified as belonging to feature `016-correction-task-flow`
instead of `002-configuration-model`'s own declared scope. The scope guard did its job — it
caught real drift before it accumulated. But the block it recorded (`kind: task_interface_gap`)
sent the next planning hint toward "plan a doctor recovery task," not toward "go formalize
`016-correction-task-flow`." The `task_interface_gap` regex
(`/task interface|first executable step|minimum progress evidence|scope|prompt/i`) matches the
word "scope" — which appears in the block's reason text for an unrelated reason ("...instead of
this feature's own declared scope...") — so every sibling-feature block gets classified as a
task-interface gap by coincidence, not by design.

### Instance B: exhausted task requests

Restoring `002-configuration-model` to `formalized` (a direct state correction for Instance A)
let task planning run again, which triggered the structured task-request backbone's one-time
backfill (`backfillTaskRequests()`, `src/orchestrator/orchestrator.ts`) for this
never-formalized-with-task-requests feature. The backfill correctly reconstructed 4 task
requests from `feature.md`'s own (long-stale) Implementation Outline, all already `complete`
given the feature's real task history — and correctly blocked rather than inventing a new task
out of thin air, since nothing was left to elaborate. But `feature.md`'s outline never kept pace
with the feature's real, evolved scope (`state.md`'s own "Remaining Deliverables" section still
lists real work), so what's actually needed is "declare more task requests for the remaining
work," not doctor-recovery. This block's reason text doesn't match any `classifyBlockerKind`
regex at all, so it falls through to `kind: unknown` — still `recoverability: agent`, still
routed toward the same generic, wrong hint.

## What needs to change

Both call sites (`blockIfBelongsToOtherFeature` for Instance A; the "every task request
exhausted" block in `planTask()` for Instance B, both in `src/orchestrator/orchestrator.ts`)
already know deterministically what's actually wrong and what should happen next — neither needs
to be reconstructed later from prose. `recordBlockedFeature`/`persistBlockedFeature` should be
able to accept an explicit blocker kind and an explicit next-planning-hint from a call site that
already knows them, instead of always re-deriving `BlockerKind` via `classifyBlockerKind`'s
regex-over-reason-text approach. `classifyBlockerKind` itself should stay as the fallback for
call sites that genuinely don't know the kind up front (e.g. quality-gate/implementation
failures).

## Scope

This feature includes:

- making both the sibling-feature block path and the exhausted-task-requests block path (and any
  equivalent formalization-time sibling block) record their actual kind and a correct
  next-planning-hint deterministically, without depending on `classifyBlockerKind`'s regex
  reconstruction
- whatever narrow adjustment to `recordBlockedFeature`/`persistBlockedFeature`'s signature is
  needed to accept an explicit kind/hint from a call site that already knows it

This feature does not include:

- rewriting `classifyBlockerKind`'s regex set in general, or changing how any *other* blocker
  kind (state corruption, review failure, implementation failure, environment, cli mismatch) gets
  classified — those call sites genuinely don't know the kind up front and should keep using it
- the structured task-request/locked-scope backbone itself (already built; both instances above
  are independent of it, though Instance B surfaced through its own backfill/exhaustion safety
  net working as designed)
- fixing `feature.md`'s stale Implementation Outline for `002-configuration-model` specifically,
  or building a mechanism to add task requests to an already-backfilled/formalized feature — that
  gap was worked around directly (a manually added task request, documented in
  `docs/features/002-configuration-model/state.md`) to unblock this feature while this fix was
  being filed; a general "declare more task requests later" mechanism is a separate, larger
  question
- the unrelated, already-known correction-task-id-allocator cycle/depth-limit gap noted in
  `docs/features/002-configuration-model/state.md`'s Known Gaps
