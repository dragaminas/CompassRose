# Fix: Blocked-feature scope misclassification

## Status

Planned

## Severity

medium

## Owning Feature

none

## Purpose

Ensure blocked-feature recovery metadata reflects the deterministic cause already known by the call site, so recovery guidance points to the correct next action.

## Problem

`recordBlockedFeature`/`persistBlockedFeature` currently relies on `classifyBlockerKind` to reconstruct blocker meaning from free-text reason strings. This misclassifies at least two real cases:

- A sibling-feature scope block is classified as `task_interface_gap` because the reason contains the word “scope”, and its recovery hint incorrectly recommends planning doctor recovery instead of formalizing the owning sibling feature.
- An exhausted task-request block falls through to `unknown`, but still receives generic agent/doctor-recovery guidance instead of directing the planner to declare task requests for the remaining work.

The defect affects recovery routing, but the reported cases have operational workarounds, so severity is medium.

## Scope

This fix includes:

- Recording the actual blocker kind and next-planning-hint deterministically for sibling-feature scope blocks.
- Recording the actual blocker kind and next-planning-hint deterministically for exhausted task-request blocks.
- Applying the same explicit metadata behavior to any equivalent formalization-time sibling-feature block.
- Making the narrow `recordBlockedFeature`/`persistBlockedFeature` interface adjustment needed for call sites to supply explicit blocker metadata.
- Preserving `classifyBlockerKind` as the fallback for call sites that do not know the blocker kind up front.
- Adding regression coverage for the two reported scenarios and the fallback path.

This fix does not include:

- Rewriting the general `classifyBlockerKind` regex set.
- Changing classification for state corruption, review failure, implementation failure, environment, CLI mismatch, or other call sites that genuinely require fallback classification.
- Reworking the structured task-request or locked-scope backbone.
- Repairing the stale `feature.md` outline for `002-configuration-model` or creating a general task-request backfill mechanism.
- Fixing the unrelated correction-task-id allocator cycle/depth-limit gap.
- Introducing an architecture document.

## Acceptance Criteria

- A sibling-feature scope block records an explicitly supplied blocker kind and a hint directing recovery toward formalizing the correct sibling feature.
- An exhausted task-request block records an explicitly supplied blocker kind and a hint directing recovery toward declaring task requests for remaining work.
- Equivalent formalization-time sibling blocks receive the same deterministic treatment.
- The affected paths do not depend on regex matching against the reason text to determine their kind or next-planning-hint.
- Call sites without explicit blocker metadata continue to use `classifyBlockerKind` unchanged.
- Existing blocker persistence and recovery behavior remains valid for unaffected blocker kinds.
- The repository’s configured typecheck and test commands complete successfully.

## Implementation Deliverables

- An explicit blocker-kind and next-planning-hint input path through `recordBlockedFeature` and `persistBlockedFeature`, with fallback classification retained.
- Updated sibling-feature and exhausted-task-request blocker call sites, including the equivalent formalization-time path.
- Regression tests covering deterministic metadata, prevention of the two reported misroutes, and fallback classification.

## Completion Criteria

This fix is considered resolved when:

- The affected call sites persist their known blocker kind and recovery hint without prose-based reconstruction.
- Regression coverage proves both reported cases route to their intended recovery actions.
- Fallback classification remains covered and unaffected behavior is preserved.
- Configured typecheck and test quality gates pass.

## Implementation Outline

This section lists the visible task requests that make up the fix’s intended implementation path. Each item is one bounded task request, not a long-lived executable task.

1. Define the narrow explicit blocker metadata contract for the recording and persistence path while retaining fallback classification.
2. Update sibling-feature scope and exhausted-task-request blocker paths, including the equivalent formalization-time path, to provide deterministic kinds and next-planning-hints.
3. Add regression coverage for both reported misclassifications and fallback behavior, then validate with the configured typecheck and test commands.

## Related Documents

- `state.md`
