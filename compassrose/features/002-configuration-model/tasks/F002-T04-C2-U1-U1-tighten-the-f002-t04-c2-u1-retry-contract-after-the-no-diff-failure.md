# Task F002-T04-C2-U1-U1: Tighten the F002-T04-C2-U1 retry contract after the no-diff failure

## Task ID
`F002-T04-C2-U1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Convert the failed F002-T04-C2-U1 attempt into a narrowly scoped, artifact-backed retry contract so the next implementation run can resume that task without redoing broad proto exploration.

## First Executable Step
Edit `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md` to add a recovery-focus section that cites the no-diff/context_overflow attempt, the exact fallback behavior to implement in `resolveImplementationFailureActiveTask`, and the two-file reattempt scope.

## Minimum Progress Evidence
- A git diff shows `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md` was updated with the failed-attempt evidence and the restoration target `task_ready` with `active_task: F002-T04-C2-U1`.
- The task document now explicitly limits the reattempt to `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts` and names the `blockedBy` signature fallback as the required behavior to implement.

## Trace
- Roadmap objective: Connect configuration validation to the broader runtime flow and update state based on approved behavior.
- Feature goal: CompassRose can read project-local configuration, validate it, and use it as the project-level source of runtime policy during runtime orchestration.
- State gap: Feature `002-configuration-model` is in `implementation_failed` after F002-T04-C2-U1 produced no repository progress; the active task needs a tighter, artifact-backed execution contract before it is retried.

## Context
- The current blocker is a recoverable implementation failure: the latest F002-T04-C2-U1 attempt produced no git diff and was classified as `context_overflow`. The preserved attempt artifact already narrows the likely fix to `resolveImplementationFailureActiveTask` plus a regression test, but that diagnosis is trapped in transient attempt output. This unblock task should move that diagnosis into the active task contract so the next run starts from the exact code/test surface and restoration target instead of repeating repository-wide proto analysis.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`

Forbidden:
- `proto/`
- `tests/`
- `src/`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `.git/proto-compassrose/implementation-attempts/`

## Constraints
- Generate exactly one documentation-only unblock adjustment for the existing active task; do not implement the proto fix in this unblock task.
- Use the preserved implementation attempt as the source of blocker evidence and diagnosed fix scope; do not ask the next implementer to rediscover the root cause.
- Keep the recovery contract specific to F002-T04-C2-U1 and preserve the restoration target `task_ready` with `active_task: F002-T04-C2-U1`, `active_correction_task: none`, and `active_unblock_task: none`.
- Do not widen scope into feature replanning, prototype refactoring, or state-document rewrites.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The F002-T04-C2-U1 task document records the failed no-diff/context_overflow attempt and the explicit restoration target to return the feature to `task_ready` with `active_task: F002-T04-C2-U1`.
- The same task document constrains the next implementation attempt to the diagnosed file pair `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts` and states the required `blockedBy` signature fallback behavior for `resolveImplementationFailureActiveTask`.
- The task document replaces broad proto exploration with one concrete first execution step and minimum progress evidence tied to the two-file retry scope.
- No files outside the allowed task-document path are modified.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md`
- `.git/proto-compassrose/implementation-attempts/F002-T04-C2-U1.json`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check
grep -F 'context_overflow' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
grep -F 'proto/protoCompassRose.ts' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
grep -F 'tests/resolveImplementationFailureActiveTask.test.ts' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
grep -F 'blockedBy' 'docs/features/002-configuration-model/tasks/F002-T04-C2-U1-preserve-the-f002-t04-c2-task-anchor-during-implementation-failure-recovery.md'
```

## Expected Deliverables
- `documentation`

## Blocker Context

- kind: implementation_failure
- signature: implementation-failure-implementation-failed-feature-002-configuration-model-is-in-implementatio
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=none; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed; plan a bounded recovery unblock task that restores task readiness for F002-T04-C2-U1.
- evidence: - kind: implementation_failure
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C2-U1`
- active_correction_task: `none`
- active_unblock_task: `none`
