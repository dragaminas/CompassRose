# Task F002-T04-C2-U1: Preserve the F002-T04-C2 task anchor during implementation-failure recovery

## Task ID
`F002-T04-C2-U1`

## Parent Feature
`002-configuration-model`

## Goal
Fix the prototype recovery path so the saved F002-T04-C2 failure artifact is treated as recoverable unblock context, preserving the task-ready restoration target for `active_task: F002-T04-C2` instead of collapsing to a null task anchor.

## First Executable Step
Write a failing regression test in `tests/resolveImplementationFailureActiveTask.test.ts` that asserts `resolveImplementationFailureActiveTask` preserves `blockedFrom.active_task: F002-T04-C2` instead of collapsing to `none`, then implement the fix in `proto/protoCompassRose.ts`.

## Minimum Progress Evidence
- A failing automated regression reproduces the F002-T04-C2 recovery case where `raw_output` contains repository-edit evidence but the normalized attempt data still drops the recoverable task anchor.
- The recovery implementation changes so the same regression passes and preserves restoration data for `lifecycle_state: task_ready`, `active_task: F002-T04-C2`, `active_correction_task: none`, and `active_unblock_task: none`.

## Recovery Focus

This section captures the lesson from the failed F002-T04-C2-U1 retry attempt so the next implementation run does not repeat the same mistake.

### Failed Attempt Evidence

- Attempt ID: `F002-T04-C2-U1`
- Classification: `context_overflow`
- Outcome: no git diff produced; first_executable_step_status=attempted; minimum_progress_evidence_status=absent
- The implementer read all context files and identified the root cause in `resolveImplementationFailureActiveTask()` at `proto/protoCompassRose.ts` (~line 2612), where the method unconditionally sets `active_task: none`, `active_correction_task: none`, `active_unblock_task: none` instead of preserving `blockedFrom.active_task` (which was `F002-T04-C2`).
- The implementer stopped before writing the failing regression test because the context window was exhausted.

### Required Fallback Behavior for `resolveImplementationFailureActiveTask`

The method `resolveImplementationFailureActiveTask` in `proto/protoCompassRose.ts` must implement a `blockedBy` signature fallback:

- When `blockedFrom.active_task` is present and non-empty, `resolveImplementationFailureActiveTask` must **preserve** that value in the restoration output instead of collapsing to `none`.
- When `blockedFrom.active_task` is absent or empty, the method may fall back to `none`.
- The same rule applies to `active_correction_task` and `active_unblock_task`: preserve from `blockedFrom` when present, only default to `none` when the source is absent.
- The restoration target after recovery must be `lifecycle_state: task_ready` with `active_task: F002-T04-C2`, `active_correction_task: none`, `active_unblock_task: none`.

### Two-File Reattempt Scope

The next implementation attempt must be confined to exactly two files:

1. `proto/protoCompassRose.ts` — fix `resolveImplementationFailureActiveTask` to preserve `blockedFrom.active_task` (and related fields) using the `blockedBy` signature fallback described above.
2. `tests/resolveImplementationFailureActiveTask.test.ts` — add a regression test that constructs a `blockedFrom` object with `active_task: F002-T04-C2`, calls `resolveImplementationFailureActiveTask`, and asserts the returned `active_task` equals `F002-T04-C2` (not `none`).

No other files should be modified in this retry.

## Trace
- Roadmap objective: Use repository-local configuration and runtime policy to drive deterministic orchestration and recovery.
- Feature goal: Connect the documented configuration model to the runtime flow without requiring manual recovery when implementation fails.
- State gap: The runtime contract says implementation-failure recovery must preserve the active task anchor, but the current observed recovery state is `lifecycle=implementation_failed; active_task=none; active_correction_task=none; active_unblock_task=none` even though the latest artifact still identifies recoverable work for `F002-T04-C2`.

## Context
- The blocker is in the prototype recovery surface, not in the configuration contract itself. The selector entered unblock planning with no active task anchor, while the saved F002-T04-C2 attempt artifact still contains the task id, raw edit evidence, and a recoverable `context_overflow` classification. Repair only the logic that converts that artifact into deterministic recovery and unblock-planning state.

## Scope
Allowed:
- `.git/proto-compassrose/implementation-attempts/F002-T04-C2.json`
- `proto/protoCompassRose.ts`
- `tests/resolveImplementationFailureActiveTask.test.ts`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/planner/unblock-task-planning-prompt.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/config/`
- `src/doctor/`
- `docs/compassrose/CONFIG.md`
- `docs/features/001-project-identity-and-foundation/`
- `any path outside the allowed_paths list`

## Constraints
- Start with a failing regression test in `tests/resolveImplementationFailureActiveTask.test.ts`; do not patch recovery logic first.
- Do not reimplement or finish `F002-T04-C2` inside this task; only repair the recovery path that must return it to `task_ready`.
- Preserve the recovery lesson that partial work may already exist; do not add logic that discards worktree progress solely because normalized diff capture is empty.
- Keep any contract wording changes minimal and limited to the active-task preservation rule for `implementation_failed` recovery.
- Confine this retry to exactly two files: `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts`.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A regression test reproduces the current F002-T04-C2 failure normalization from the saved attempt artifact and fails before the fix.
- After the fix, the recovery and unblock-planning path preserves `active_task: F002-T04-C2` and restoration target `task_ready` with cleared correction and unblock pointers for this implementation-failed case.
- The unblock fix stays scoped to prototype recovery and context assembly and does not change configuration-loading, doctor validation, or unrelated feature-planning behavior.

## Files Likely Affected
- `proto/protoCompassRose.ts`
- `tests/resolveImplementationFailureActiveTask.test.ts`
- `.git/proto-compassrose/implementation-attempts/F002-T04-C2.json`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/planner/unblock-task-planning-prompt.md`

## Quality Gates to Run
```bash
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`

## Blocker Context

- kind: implementation_failure
- signature: implementation-failure-implementation-failed-feature-002-configuration-model-is-in-implementatio
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=none; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed; plan a bounded recovery unblock task that restores task readiness for F002-T04-C2.
- evidence: - kind: implementation_failure
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C2`
- active_correction_task: `none`
- active_unblock_task: `none`

## Unblock-Task Restoration Target

Completing this unblock adjustment (`F002-T04-C2-U1-U1`) restores the feature to `task_ready` with `active_task: F002-T04-C2-U1`, `active_correction_task: none`, and `active_unblock_task: none`, leaving the downstream retry target for the later `F002-T04-C2` recovery (two-file scope: `proto/protoCompassRose.ts` and `tests/resolveImplementationFailureActiveTask.test.ts` with `blockedBy` fallback) intact for a subsequent retry.

`docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` are background evidence only for this unblock task and are not edit targets.
