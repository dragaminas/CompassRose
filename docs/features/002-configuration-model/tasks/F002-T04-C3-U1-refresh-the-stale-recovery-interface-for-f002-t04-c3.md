# Task F002-T04-C3-U1: Refresh the stale recovery interface for F002-T04-C3

## Task ID
`F002-T04-C3-U1`

## Parent Feature
`002-configuration-model`

## Goal
Repair the stale recovery instructions around `F002-T04-C3` so they match the current `implementation_failed` checkpoint, keep `F002-T04-C3` as the active task anchor, and align the feature/project state documents to one explicit recovery path back to `task_ready`.

## First Executable Step
Open `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` and replace its obsolete `review_pending`-based recovery target and stale task references with the current `implementation_failed` -> `task_ready` recovery target for `F002-T04-C3`.

## Minimum Progress Evidence
- `git diff -- docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` shows the repaired recovery task now names the current `task_interface_gap`, the current task anchor `F002-T04-C3`, and the restoration target `task_ready`.
- `git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` shows both state documents aligned to the repaired recovery path, no longer referencing obsolete unblock-task identifiers or stale recovery narration, and preserving the no-diff plus missing `Implementation Notes` lesson.

## Trace
- Roadmap objective: Keep repository-local configuration work moving by preserving deterministic runtime recovery for the configuration-model feature.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The active recovery instructions for `F002-T04-C3` describe an obsolete state-repair scenario, so implementers cannot deterministically recover the current `implementation_failed` checkpoint.

## Context
- Feature `002-configuration-model` already has approved configuration-model work and a live `implementation_failed` checkpoint on `F002-T04-C3`, but the recovery interface is stale. The current feature state records `implementation_failed` with `active_task: F002-T04-C3`, the latest implementation attempt artifact shows no diff and no `Implementation Notes`, and `docs/compassrose/PROJECT_STATE.md` still points at an older unblock artifact. This unblock task should tighten the recovery interface and realign repository documentation without reopening feature planning or rewriting runtime state as if recovery were already approved.

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
- Keep the unblock task documentation-only; do not change runtime code, config loading, or test files.
- Preserve `F002-T04-C3` as the recovery anchor and make the restoration target explicit as `task_ready` with `active_task: F002-T04-C3`, `active_correction_task: none`, and `active_unblock_task: none`.
- Do not silently rewrite runtime-deciding state sections to the restored state during the unblock implementation; document the recovery path so runtime can restore it after approval.
- Remove stale references to obsolete task IDs and outdated `review_pending`-based repair guidance so the next implementer does not have to infer the intended target.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` is rewritten or superseded in place so its blocker description, objective, and acceptance criteria explicitly anchor on the current `implementation_failed` checkpoint for `F002-T04-C3` and the restoration target `task_ready`.
- `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` describe the same current blocker and repaired recovery path, with no obsolete unblock-task identifier or stale state-repair narrative left behind.
- The repaired recovery artifact tells the implementer exactly which repository facts matter for recovery, including that the previous attempt produced no diff and no required `Implementation Notes`, so no repository-wide exploration or state-target inference is required.
- The unblock task stays within the three allowed documentation files and does not modify configuration contracts, runtime contracts, or source code.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `.git/proto-compassrose/implementation-attempts/F002-T04-C3.json`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check
grep -q 'implementation_failed' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'F002-T04-C3' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md
grep -q 'F002-T04-C3' docs/features/002-configuration-model/state.md && grep -q 'F002-T04-C3' docs/compassrose/PROJECT_STATE.md && test -z "$(grep -n 'F002-T04-C2-U1-U1-C1-C1-U1' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md docs/compassrose/PROJECT_STATE.md)"
```

## Expected Deliverables
- `documentation`
- `documentation`
- `documentation`

## Blocker Context

- kind: task_interface_gap
- signature: task-interface-gap-F002-T04-C3-stale-state-repair-task
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=F002-T04-C3; active_correction_task=none; active_unblock_task=none
- evidence: `F002-T04-C3` asks the implementer to fix an older `review_pending` inconsistency that no longer matches the current `state.md` and `PROJECT_STATE.md`, so the implementer produced no diff, no minimum-progress evidence, and no required `Implementation Notes`.
- evidence: `docs/features/002-configuration-model/state.md` records the recoverable implementation failure for `F002-T04-C3` and keeps the active task anchor visible.
- evidence: `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` still needs to preserve the current recovery anchor and stale-interface lesson in one place.
- evidence: `docs/compassrose/PROJECT_STATE.md` still pointed at an older unblock artifact before the recovery interface was refreshed.

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C3`
- active_correction_task: `none`
- active_unblock_task: `none`
