# Task F002-T04-C2-U1-U1-C1-C1: Resubmit the retry-restoration-target task with a single-path diff and compliant implementation notes

## Task ID
`F002-T04-C2-U1-U1-C1-C1`

## Parent Task
`F002-T04-C2-U1-U1-C1`

## Parent Feature
`002-configuration-model`

## Goal
Resubmit the already-correct task-document change so the reviewable diff contains only `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`, while also emitting a non-empty `implementation.notes` field in the implementation artifact.

## First Executable Step
Recreate the submission from a diff that contains only `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`, leaving `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` out of the reviewable diff, then regenerate the implementation artifact with a non-empty `implementation.notes` field.

## Minimum Progress Evidence
- `git diff --name-only` for the resubmitted attempt returns only `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`.
- The resubmitted diff still contains the outer `active_task: F002-T04-C2-U1` restoration target and still retains the `blockedBy` fallback plus the exact two-file downstream retry scope for `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts`.
- The regenerated implementation artifact contains a non-empty `implementation.notes` field and lists only the allowed task document in `changed_files`.

## Review Findings
- The submitted diff still includes forbidden edits to `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md`.
- The implementation artifact omits the required `implementation.notes` field and only exposes a non-contract `implementation_notes` field.
- The task-document content already satisfies the restoration-target and downstream retry-contract requirements, so the correction should focus only on scope-isolated resubmission and artifact compliance.

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
- Keep the current task-document content for the outer restoration target and the downstream `blockedBy`/two-file retry contract intact; only make minimal wording adjustments if needed to preserve those passed criteria.
- The reviewable diff must contain only `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`; do not submit feature-state or project-state edits.
- Emit a non-empty `implementation.notes` field in the implementation artifact; a top-level `implementation_notes` field does not satisfy the contract.
- Do not touch proto, tests, source files, feature state, project state, or configuration files for this correction.

## Acceptance Criteria
- The submitted diff contains no changes outside `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`.
- The task document still explicitly states that completing `F002-T04-C2-U1-U1` restores the feature to `task_ready` with `active_task: F002-T04-C2-U1`, `active_correction_task: none`, and `active_unblock_task: none`.
- The same document still preserves the required `blockedBy` fallback behavior and the exact downstream retry scope `proto/protoCompassRose.ts` plus `tests/resolveImplementationFailureActiveTask.test.ts`.
- The implementation artifact contains a non-empty `implementation.notes` field.

## Quality Gates to Run
```bash
git diff --check
grep -F 'active_task: F002-T04-C2-U1' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
grep -F 'blockedBy' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
grep -F 'tests/resolveImplementationFailureActiveTask.test.ts' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
test "$(git diff --name-only)" = "docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md"
test -z "$(git diff --name-only -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)"
```
