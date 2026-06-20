# Task F002-T04-C3-U1-C1: Complete the F002-T04-C3 recovery-path refresh

## Task ID
`F002-T04-C3-U1-C1`

## Parent Task
`F002-T04-C3-U1`

## Parent Feature
`002-configuration-model`

## Goal
Finish the stale recovery-interface repair so the `004.3` recovery artifact, `state.md`, and `PROJECT_STATE.md` all preserve `F002-T04-C3` as the recovery anchor, describe the current `implementation_failed` checkpoint, and document the explicit restoration path back to `task_ready`.

## First Executable Step
Open `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` and replace the remaining `F002-T04`/`review_pending` recovery text with the required `F002-T04-C3` -> `task_ready` target, including the prior no-diff and missing `Implementation Notes` evidence.

## Minimum Progress Evidence
- `git diff -- docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` shows the goal, minimum progress evidence, acceptance criteria, and State Target now preserve `F002-T04-C3` as the restoration anchor and `task_ready` as the recovery target.
- `git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` shows one consistent blocker/recovery narrative, removes the stale `F002-T04-C1` no-diff reference, and leaves no contradiction about whether the feature is blocked or awaiting review.

## Review Findings
- The repaired `004.3` task still targets `F002-T04`/`review_pending` instead of `F002-T04-C3`/`task_ready`.
- The recovery artifact still omits the prior no-diff and missing `Implementation Notes` evidence required for deterministic recovery.
- The feature and project state documents still do not describe one consistent blocker and recovery path.

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
- `docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md` explicitly anchors its objective, first executable step, acceptance criteria, and State Target on the current `implementation_failed` checkpoint for `F002-T04-C3` and the restoration target `task_ready`.
- `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` describe the same blocker and the same recovery path for `F002-T04-C3-U1`, with no stale `F002-T04-C1` recovery narrative or contradictory blocked/not-blocked statements.
- The repaired recovery artifact explicitly states that the previous `F002-T04-C3` attempt produced no diff and omitted the required `Implementation Notes`, so the next implementer can resume without inferring missing context.

## Quality Gates to Run
```bash
git diff --check
grep -q 'F002-T04-C3' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md && grep -q 'Implementation Notes' docs/features/002-configuration-model/tasks/004.3-repair-feature-state-for-f002-t04.md
grep -q 'F002-T04-C3' docs/features/002-configuration-model/state.md && grep -q 'F002-T04-C3-U1' docs/compassrose/PROJECT_STATE.md && ! grep -q 'F002-T04-C1' docs/features/002-configuration-model/state.md
```
