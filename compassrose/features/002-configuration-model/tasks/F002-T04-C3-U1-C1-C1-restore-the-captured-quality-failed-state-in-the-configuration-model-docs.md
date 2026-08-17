# Task F002-T04-C3-U1-C1-C1: Restore the captured quality_failed state in the configuration-model docs

## Task ID
`F002-T04-C3-U1-C1-C1`

## Parent Task
`F002-T04-C3-U1-C1`

## Parent Feature
`002-configuration-model`

## Goal
Update only `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` so both documents keep the captured `quality_failed` state visible, remove stale `review_pending` narration, and preserve `active_task: F002-T04-C3-U1-C1-U1` while describing the same `implementation_failed -> task_ready` recovery path.

## First Executable Step
grep -nE 'review_pending|quality_failed|F002-T04-C1|F002-T04-C3-U1-C1|F002-T04-C3-U1-C1-U1|implementation_failed|task_ready' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md

## Minimum Progress Evidence
- git diff --name-only -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md lists both files and no task artifact.
- git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md shows `review_pending` and stale `F002-T04-C1` are gone, `quality_failed` is still present, and both docs keep `implementation_failed`, `task_ready`, and `F002-T04-C3-U1-C1-U1`.

## Review Findings
- docs/features/002-configuration-model/state.md is internally inconsistent: the top-level lifecycle state and active task still say `review_pending` / `F002-T04-C3-U1-C1`, while the recovery narrative below says `implementation_failed` / `F002-T04-C3-U1-C1-U1`.
- docs/compassrose/PROJECT_STATE.md no longer preserves the captured `quality_failed` state, so the recovery record does not meet the task requirement to keep that evidence visible.

## Scope
Allowed:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `docs/features/002-configuration-model/tasks/`
- `src/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/request.md`
- `docs/ROADMAP.md`

## Constraints
- documentation-only
- preserve the captured implementation failure evidence and recovery path
- do not edit the task artifact or any code/config files
- keep shell checks portable

## Acceptance Criteria
- `docs/features/002-configuration-model/state.md` no longer contains `review_pending` or stale `F002-T04-C1`, still contains `quality_failed`, `implementation_failed`, `task_ready`, and `active_task: F002-T04-C3-U1-C1-U1`.
- `docs/compassrose/PROJECT_STATE.md` preserves `quality_failed` and the same `implementation_failed -> task_ready` path, and does not point the pending action at `F002-T04-C3-U1-C1`.
- No files outside the two allowed paths are modified.

## Quality Gates to Run
```bash
git diff --check
changed="$(git diff --name-only -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)"; printf '%s\n' "$changed" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$changed" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
! grep -q 'review_pending' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && ! grep -q 'F002-T04-C1' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && grep -q 'quality_failed' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && grep -q 'implementation_failed' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && grep -q 'task_ready' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && grep -q 'F002-T04-C3-U1-C1-U1' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md
```
