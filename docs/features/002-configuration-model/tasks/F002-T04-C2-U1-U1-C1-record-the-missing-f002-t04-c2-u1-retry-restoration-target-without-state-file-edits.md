# Task F002-T04-C2-U1-U1-C1: Record the missing F002-T04-C2-U1 retry restoration target without state-file edits

## Task ID
`F002-T04-C2-U1-U1-C1`

## Parent Task
`F002-T04-C2-U1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Amend the F002-T04-C2-U1 task document so it explicitly records that this retry-contract adjustment restores the feature to `task_ready` with `active_task: F002-T04-C2-U1`, while preserving the existing two-file retry instructions for the later `F002-T04-C2` recovery fix, and resubmit the task with a diff limited to the task document.

## First Executable Step
Edit `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md` to add one explicit sentence or bullet stating that completing `F002-T04-C2-U1-U1` returns the feature to `task_ready` with `active_task: F002-T04-C2-U1`, `active_correction_task: none`, and `active_unblock_task: none`.

## Minimum Progress Evidence
- A git diff shows only `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md` changed, and that diff adds the outer retry-contract restoration target `task_ready` with `active_task: F002-T04-C2-U1`.
- The updated task document still contains the `context_overflow` failed-attempt evidence, the `blockedBy` fallback description, and the two-file reattempt scope for `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts`.

## Review Findings
- The current task document never records the required outer retry-contract restoration target `task_ready` with `active_task: F002-T04-C2-U1`.
- The review diff leaked forbidden edits to `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md`.
- The implementation artifact omitted the required `implementation.notes` field.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `proto/`
- `tests/`
- `src/`
- `docs/compassrose/CONFIG.md`
- `.git/proto-compassrose/implementation-attempts/`

## Constraints
- Keep the existing Recovery Focus, `blockedBy` fallback, and two-file reattempt scope intact; only add the missing outer retry-contract restoration target and any minimal wording needed to align it.
- Modify only `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`; do not touch feature state, project state, proto, tests, or source files.
- Preserve the distinction between the unblock-adjustment outcome (`task_ready` with `active_task: F002-T04-C2-U1`) and the later recovery target inside `F002-T04-C2-U1` itself (`task_ready` with `active_task: F002-T04-C2`).
- Emit non-empty implementation notes in the `implementation.notes` field of the attempt artifact.

## Acceptance Criteria
- The F002-T04-C2-U1 task document explicitly states that completing `F002-T04-C2-U1-U1` restores the feature to `task_ready` with `active_task: F002-T04-C2-U1`, `active_correction_task: none`, and `active_unblock_task: none`.
- The same document still constrains the later recovery implementation to `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts` and still names the required `blockedBy` fallback behavior.
- The submitted diff contains no changes outside `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`.
- The implementation artifact contains a non-empty `implementation.notes` field.

## Quality Gates to Run
```bash
git diff --check
grep -F 'active_task: F002-T04-C2-U1' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
grep -F 'blockedBy' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
grep -F 'tests/resolveImplementationFailureActiveTask.test.ts' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
test -z "$(git diff --name-only -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)"
```
