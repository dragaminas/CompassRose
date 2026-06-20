# Task F002-T04-C3-U1-C1: Complete the F002-T04-C3 recovery-path refresh

## Task ID
`F002-T04-C3-U1-C1`

## Parent Task
`F002-T04-C3-U1`

## Parent Feature
`002-configuration-model`

## Goal
Finish the stale recovery-interface repair so the `004.3` recovery artifact, `state.md`, and `PROJECT_STATE.md` all preserve `F002-T04-C3` as the recovery anchor, describe the current `quality_failed` checkpoint on the correction path, keep the underlying `implementation_failed` recovery anchor visible, and document the explicit restoration path back to `task_ready` while retaining the prior `no diff` plus missing `Implementation Notes` evidence.

## First Executable Step
sed -n '1,220p' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md

## Minimum Progress Evidence
- `git diff -- docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` shows the goal, minimum progress evidence, acceptance criteria, and State Target now preserve `F002-T04-C3` as the restoration anchor and `task_ready` as the recovery target.
- `git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` shows one consistent blocker/recovery narrative, removes the stale `F002-T04-C1` no-diff reference, and leaves no contradiction about whether the feature is blocked or awaiting review.

## Review Findings
- The repaired `004.3` task still targets `F002-T04`/`review_pending` instead of `F002-T04-C3`/`task_ready`.
- The recovery artifact still omits the prior no-diff and missing `Implementation Notes` evidence required for deterministic recovery.
- The feature and project state documents still do not describe one consistent blocker and recovery path.
- The blocker should be classified as `task_interface_gap`, not `state_corruption`, because the task interface itself is stale.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/request.md`

## Constraints
- Keep the correction documentation-only and stay within the three allowed files.
- Preserve `F002-T04-C3` as the restoration target anchor; do not reintroduce `F002-T04`/`review_pending` recovery language in the repaired recovery artifact.
- Explicitly record that the previous `F002-T04-C3` attempt produced no diff and omitted the required `Implementation Notes`.
- Do not move repository state to `task_ready` before the unblock review is approved; document the recovery path instead.

## Acceptance Criteria
- `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` is rewritten as a `task_interface_gap` recovery artifact for `F002-T04-C3`, with the observed `quality_failed` state, the explicit restoration target back to `task_ready`, and the prior `no diff` plus missing `Implementation Notes` evidence recorded directly in the task text.
- The recovery artifact updates its first executable step, minimum progress evidence, acceptance criteria, and quality gates so they check for stale recovery markers and require aligned edits in all three allowed files.
- `docs/features/002-configuration-model/state.md` describes one consistent `F002-T04-C3` recovery path, preserves the blocked-from `implementation_failed` evidence and restoration target, and removes stale `F002-T04-C1` or empty-placeholder recovery narration.
- `docs/compassrose/PROJECT_STATE.md` matches the feature-state narrative by describing the same stale recovery-interface problem and recovery target without contradictory blocked/not-blocked wording.
- Only the three allowed documentation files change, and the resulting diff stays narrowly focused on repairing and hardening the stale recovery interface.

## Quality Gates to Run
```bash
git diff --check
grep -q 'F002-T04-C3' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'task_interface_gap' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'quality_failed' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'Implementation Notes' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md
! grep -q 'review_pending' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && ! grep -q 'F002-T04-C1' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && grep -q 'F002-T04-C3' docs/features/002-configuration-model/state.md && grep -q 'implementation_failed' docs/features/002-configuration-model/state.md && grep -q 'task_ready' docs/features/002-configuration-model/state.md && grep -q 'F002-T04-C3' docs/compassrose/PROJECT_STATE.md
files="$(git diff --name-only -- docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)" && printf '%s\n' "$files" | grep -qx 'docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md' && printf '%s\n' "$files" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$files" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
```

## Expected Deliverables
- `documentation`

## Blocker Context

- kind: task_interface_gap
- signature: task-interface-gap-F002-T04-C3-stale-preimage-mismatch
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T04-C3-U1-C1; active_correction_task=none; active_unblock_task=none
- evidence: A bounded unblock task can safely repair and harden this stale recovery interface without architectural review. It should preserve `F002-T04-C3` as the recovery anchor, restate the prior implementation-failure evidence, and tighten the task text, acceptance checks, and quality gates so the recovery documents converge on one explicit `implementation_failed -> task_ready` path.
- evidence: The latest edit attempt reported `Could not find oldString in the file` and then `No changes to apply: oldString and newString are identical`, which means the interface was operating on a stale preimage rather than a fresh target.
- evidence: The earlier `F002-T04-C3` attempt still produced no diff and omitted the required `Implementation Notes`.

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C3`
- active_correction_task: `none`
- active_unblock_task: `none`
