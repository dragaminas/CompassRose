# Task F002-T04-C2-U1: Preserve the F002-T04-C2 task anchor during implementation-failure recovery

## Task ID
`F002-T04-C2-U1`

## Parent Feature
`002-configuration-model`

## Goal
Fix the prototype recovery path so the saved F002-T04-C2 failure artifact is treated as recoverable unblock context, preserving the task-ready restoration target for `active_task: F002-T04-C2` instead of collapsing to a null task anchor.

## First Executable Step
sed -n '1,220p' .git/proto-compassrose/implementation-attempts/F002-T04-C2.json

## Minimum Progress Evidence
- A failing automated regression reproduces the F002-T04-C2 recovery case where `raw_output` contains repository-edit evidence but the normalized attempt data still drops the recoverable task anchor.
- The recovery implementation changes so the same regression passes and preserves restoration data for `lifecycle_state: task_ready`, `active_task: F002-T04-C2`, `active_correction_task: none`, and `active_unblock_task: none`.

## Trace
- Roadmap objective: Use repository-local configuration and runtime policy to drive deterministic orchestration and recovery.
- Feature goal: Connect the documented configuration model to the runtime flow without requiring manual recovery when implementation fails.
- State gap: The runtime contract says implementation-failure recovery must preserve the active task anchor, but the current observed recovery state is `lifecycle=implementation_failed; active_task=none; active_correction_task=none; active_unblock_task=none` even though the latest artifact still identifies recoverable work for `F002-T04-C2`.

## Context
- The blocker is in the prototype recovery surface, not in the configuration contract itself. The selector entered unblock planning with no active task anchor, while the saved F002-T04-C2 attempt artifact still contains the task id, raw edit evidence, and a recoverable `context_overflow` classification. Repair only the logic that converts that artifact into deterministic recovery and unblock-planning state.

## Scope
Allowed:
- `.git/proto-compassrose/implementation-attempts/F002-T04-C2.json`
- `proto/`
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
- Start with a failing regression derived from `.git/proto-compassrose/implementation-attempts/F002-T04-C2.json`; do not patch recovery logic first.
- Do not reimplement or finish `F002-T04-C2` inside this unblock task; only repair the recovery path that must return it to `task_ready`.
- Preserve the recovery lesson that partial work may already exist; do not add logic that discards worktree progress solely because normalized diff capture is empty.
- Keep any contract wording changes minimal and limited to the active-task preservation rule for `implementation_failed` recovery.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A regression test reproduces the current F002-T04-C2 failure normalization from the saved attempt artifact and fails before the fix.
- After the fix, the recovery and unblock-planning path preserves `active_task: F002-T04-C2` and restoration target `task_ready` with cleared correction and unblock pointers for this implementation-failed case.
- The unblock fix stays scoped to prototype recovery and context assembly and does not change configuration-loading, doctor validation, or unrelated feature-planning behavior.

## Files Likely Affected
- `.git/proto-compassrose/implementation-attempts/F002-T04-C2.json`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/planner/unblock-task-planning-prompt.md`
- `proto/`

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
