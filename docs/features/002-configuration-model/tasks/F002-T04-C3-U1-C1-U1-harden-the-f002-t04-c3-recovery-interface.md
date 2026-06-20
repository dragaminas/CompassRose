# Task F002-T04-C3-U1-C1-U1: Harden the F002-T04-C3 recovery interface

## Task ID
`F002-T04-C3-U1-C1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Repair the stale recovery interface around `F002-T04-C3` so the current recovery artifact, feature state, and project state all describe one explicit `implementation_failed -> task_ready` path, surface the stale exact-string preimage mismatch as a diagnostic, and carry forward the prior `no diff` plus missing `Implementation Notes` evidence before normal execution resumes.

## First Executable Step
sed -n '1,220p' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md

## Minimum Progress Evidence
- `git diff -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md` shows the recovery artifact now anchors its objective, blocker, restoration target, acceptance checks, and prior-attempt evidence on `F002-T04-C3`, `implementation_failed`, `task_ready`, `no diff`, and missing `Implementation Notes`.
- `git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` shows both state documents were edited and now carry the same blocker classification, restoration target, and recovery narrative without stale `F002-T04-C1` or contradictory blocked-state wording.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: Feature `002-configuration-model` is stuck in `quality_failed` because the current recovery path is a stale recovery interface: the recovery artifact still preserves obsolete `F002-T04`/`review_pending` anchors, omits the prior `F002-T04-C3` no-diff plus missing `Implementation Notes` evidence, and the latest edit attempt hit a stale exact-string preimage instead of producing a diagnostic or a diff.

## Context
- The current observed state is `lifecycle=quality_failed; active_task=F002-T04-C3-U1-C1; active_correction_task=none; active_unblock_task=none`. This is not a simple malformed-state repair: the unblock task must reclassify the blocker as `task_interface_gap`, preserve `F002-T04-C3` as the recovery anchor, restate that the prior root attempt produced no diff and omitted required `Implementation Notes`, and remove or rewrite the stale markers `F002-T04`, `review_pending`, `F002-T04-C1`, and contradictory feature/project recovery narration.
- The latest attempt also failed with `Could not find oldString in the file` followed by `No changes to apply: oldString and newString are identical`, which is evidence that the interface was patching a stale preimage and needs a live read before any retry.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/compassrose/CONFIG.md`
- `src/`

## Constraints
- Update only the current recovery artifact and the two state documents; do not repair this by editing a stale task file or by touching source code, tests, or configuration contracts.
- Preserve `F002-T04-C3` as the restoration anchor and document the restoration target exactly as `lifecycle_state: task_ready`, `active_task: F002-T04-C3`, `active_correction_task: none`, and `active_unblock_task: none`.
- Carry the prior implementation-failure evidence directly in the recovery artifact and aligned state narratives: the earlier `F002-T04-C3` attempt produced no diff and omitted the required `Implementation Notes`.
- Keep the task documentation-only, and make the feature and project narratives consistent with the current `quality_failed` recovery situation instead of generic state-corruption wording or contradictory blocked/not-blocked text.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md` is rewritten as a `task_interface_gap` recovery artifact for `F002-T04-C3`, with the observed `quality_failed` state, the explicit restoration target back to `task_ready`, and the prior `no diff` plus missing `Implementation Notes` evidence recorded directly in the task text.
- The recovery artifact updates its first executable step, minimum progress evidence, acceptance criteria, and quality gates so they check for stale recovery markers and require aligned edits in all three allowed files.
- `docs/features/002-configuration-model/state.md` describes one consistent `F002-T04-C3` recovery path, preserves the blocked-from `implementation_failed` evidence and restoration target, and removes stale `F002-T04-C1` or empty-placeholder recovery narration.
- `docs/compassrose/PROJECT_STATE.md` matches the feature-state narrative by describing the same stale recovery-interface problem and recovery target without contradictory blocked/not-blocked wording.
- Only the three allowed documentation files change, and the resulting diff stays narrowly focused on repairing and hardening the stale recovery interface.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/unblock-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check
grep -q 'F002-T04-C3' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md && grep -q 'implementation_failed' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md && grep -q 'no diff' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md && grep -q 'Implementation Notes' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md
! grep -q 'F002-T04-C1' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && grep -q 'F002-T04-C3' docs/features/002-configuration-model/state.md && grep -q 'implementation_failed' docs/features/002-configuration-model/state.md && grep -q 'task_ready' docs/features/002-configuration-model/state.md && grep -q 'F002-T04-C3' docs/compassrose/PROJECT_STATE.md
files="$(git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)" && printf '%s\n' "$files" | grep -qx 'docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md' && printf '%s\n' "$files" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$files" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
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
