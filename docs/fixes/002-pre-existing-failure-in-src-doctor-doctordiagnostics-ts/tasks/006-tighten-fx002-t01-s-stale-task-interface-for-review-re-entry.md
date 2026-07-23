# Task 006: Tighten FX002-T01's stale task interface for review re-entry

## Task ID
`FX002-T06`

## Task Lineage

- previous_task_id: `FX002-T05`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Revise the existing FX002-T01 task interface so its bounded scope and evidence requirements describe repository-supported Doctor behavior, preserve the confirmed blocker history, and allow deterministic restoration to review_pending with FX002-T01 active.

## First Executable Step
Get-Content -Raw -LiteralPath 'docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md'

## Minimum Progress Evidence
- The existing FX002-T01 task-interface artifact has a non-empty, reviewable documentation diff within the allowed path.
- Absent or forbidden DoctorDiagnostics source and test paths are removed or narrowed from the task interface without inventing a new manifest, validator, or artifact type.
- The revised interface retains the blocker signature, recovery lineage, concrete execution evidence, and bounded acceptance criteria.
- No source, test, feature-state, project-state, or contract files are changed.

## Trace
- Roadmap objective: Advance CompassRose recovery deterministically while preserving task history and runtime state invariants.
- Feature goal: Restore the blocked fix task to a reviewable state so the pre-existing test failure can be addressed under a valid repository-supported scope.
- State gap: The recorded state-corruption blocker says the bounded FX002-T01 scope names absent forbidden files, has no reproducible repairable DoctorDiagnostics failure, and has an empty test-guided diff; the task interface must be tightened before review re-entry.

## Context
- The runtime selected agent-recoverable doctor recovery with a fixed restoration target. The confirmed blocker is a task-interface/diagnosis mismatch, not a source defect. The later timeout refinement is advisory and must not introduce unsupported requirements.

## Scope
Allowed:
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`

Forbidden:
- `src/**`
- `tests/**`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/fix.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/**`
- `docs/features/**`
- `Any repository path other than the single allowed FX002-T01 task-interface artifact`

## Constraints
- Execute this as a doctor recovery with executor_role=doctor and review_policy=no_review_loop.
- Preserve blocker kind state_corruption, signature state-corruption-review-pending-no-repairable-failure-exists-within-the-bounded-task-scope-the-n, recoverability agent, and observed_state lifecycle=review_pending.
- Restore exactly lifecycle_state=review_pending, active_task=FX002-T01, active_correction_task=none, and active_unblock_task=none after the recovery gates pass.
- Keep FX002-T01 as the resumed task anchor and preserve FX002-T05 as historical recovery lineage through previous_task_id.
- Modify only the existing task interface; do not implement source or tests, alter state directly, delete recovery history, or redesign contracts.
- Do not propagate the advisory timeout as a new confirmed defect or invent a manifest, validator, or artifact type.
- Use only the recovery task's own re-entry gates; do not inherit the active implementation task's full quality-gate set.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The revised task artifact remains valid against the existing planner/task contracts and is independently reviewable.
- The task scope and deliverables no longer depend on absent or forbidden DoctorDiagnostics source/test paths and remain bounded to the documented fix objective.
- The confirmed blocker evidence and recovery lineage remain explicit; the earlier task/recovery history is not deleted or silently rewritten.
- The recovery makes documentation-only changes within the single allowed path.
- The doctor recovery uses no_review_loop semantics and passes its literal re-entry quality gate.
- The runtime can restore the exact target review_pending / FX002-T01 / none / none.

## Files Likely Affected
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/planner/output.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/compassrose/CONFIG.md`

## Quality Gates to Run
```bash
git diff --check -- 'docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md'
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-blocked-recoverable-blocker-state-corruption-review-pending-no-repairable-failu
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=FX002-T01; active_correction_task=none; active_unblock_task=none
- evidence: Recoverable blocker state-corruption-review-pending-no-repairable-failure-exists-within-the-bounded-task-scope-the-n recorded; running diagnostic/autocorrection before stopping because loop mode is disabled.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-review-pending-no-repairable-failure-exists-within-the-bounded-task-scope-the-n
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: review_pending
- active_task: `FX002-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
