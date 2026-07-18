# Request: Sibling-feature scope blocks are misrouted to doctor-recovery

When task planning refuses a proposed task because the scope guard identifies it as belonging
to a sibling feature (`scope_justification.belongs_to_other_feature`, see
`src/contracts/planner/feature-scope-guard.md`), the resulting block should point whoever
recovers it toward formalizing or advancing the named sibling feature. Instead, it gets routed
toward planning a doctor-recovery task, which is the wrong kind of recovery for this situation
entirely.

This actually happened: task planning for `002-configuration-model` proposed "Bound
correction-task ID allocation," which the planner correctly identified as belonging to feature
`016-correction-task-flow` instead of `002-configuration-model`'s own declared scope. The scope
guard did its job — it caught real drift before it accumulated. But the block it recorded
(`kind: task_interface_gap`) sent the next planning hint toward "plan a doctor recovery task,"
not toward "go formalize `016-correction-task-flow`."

## Root cause

`classifyBlockerKind` (`src/state/blockerClassification.ts`) reclassifies every blocker by
running a set of regexes over the block's own free-text reason string — it doesn't know the
blocker's real kind from the call site that raised it, only what it can pattern-match after the
fact. The `task_interface_gap` regex (`/task interface|first executable step|minimum progress
evidence|scope|prompt/i`) matches the word "scope" — which appears in the sibling-feature block's
reason text for an unrelated reason ("...instead of this feature's own declared scope...") — so
every sibling-feature block gets classified as a task-interface gap by coincidence, not by
design. `recoverability` then defaults to `'agent'` (only the `environment` kind maps to
`'human'`/`'terminal'`), so it looks routinely auto-recoverable via doctor-recovery, when the
actual right move is external: formalize a different feature.

## What needs to change

The call site that raises a sibling-feature block (`orchestrator.ts`'s
`blockIfBelongsToOtherFeature`, and any equivalent for `TaskRequestSiblingCheck` at formalization
time) already knows deterministically that this is a "belongs to another feature" situation — it
doesn't need to be reconstructed later from prose. `recordBlockedFeature`/`persistBlockedFeature`
should be able to accept an explicit blocker kind (and an explicit next-planning-hint, e.g. "go
formalize `<sibling_id>`") from a call site that already knows it, instead of always re-deriving
`BlockerKind` via `classifyBlockerKind`'s regex-over-reason-text approach. `classifyBlockerKind`
itself should stay as the fallback for call sites that genuinely don't know the kind up front
(e.g. quality-gate/implementation failures).

## Scope

This feature includes:

- making the sibling-feature block path (and any equivalent formalization-time sibling block)
  record its actual kind and a correct next-planning-hint deterministically, without depending on
  `classifyBlockerKind`'s regex reconstruction
- whatever narrow adjustment to `recordBlockedFeature`/`persistBlockedFeature`'s signature is
  needed to accept an explicit kind/hint from a call site that already knows it

This feature does not include:

- rewriting `classifyBlockerKind`'s regex set in general, or changing how any *other* blocker
  kind (state corruption, review failure, implementation failure, environment, cli mismatch) gets
  classified — those call sites genuinely don't know the kind up front and should keep using it
- the structured task-request/locked-scope backbone (already built; this bug is independent of
  it, though it happened to surface through a scope-guard block during that work)
- the unrelated, already-known correction-task-id-allocator cycle/depth-limit gap noted in
  `docs/features/002-configuration-model/state.md`'s Known Gaps
