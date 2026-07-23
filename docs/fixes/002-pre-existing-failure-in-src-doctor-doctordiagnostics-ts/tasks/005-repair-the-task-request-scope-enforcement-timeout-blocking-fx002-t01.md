# Task 005: Repair the task-request scope-enforcement timeout blocking FX002-T01

## Task ID
`FX002-T05`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Diagnose and make the smallest source or test change required for tests/taskRequestScopeEnforcement.test.ts to complete deterministically, removing the observed quality-gate blocker before resuming FX002-T01.

## First Executable Step
Run `npm test -- tests/taskRequestScopeEnforcement.test.ts` from the repository root and capture the direct timeout path.

## Minimum Progress Evidence
- A source or test diff exists only within the allowed recovery paths and directly addresses the named timeout path.
- `npm test -- tests/taskRequestScopeEnforcement.test.ts` completes successfully without timing out.
- `npm run typecheck` completes successfully.

## Trace
- Roadmap objective: Keep the CompassRose foundation workflow advancing by clearing the active feature's recoverable quality-gate blocker.
- Feature goal: Repair the pre-existing failure in src/doctor/doctorDiagnostics.ts so npm test can pass.
- State gap: The runtime records quality_failed with FX002-T01 active and no recovery task, while deterministic execution must resume at implementation_running with the same task anchor.

## Context
- The recorded blocker is an agent-recoverable quality failure: tests/taskRequestScopeEnforcement.test.ts timed out after 20000ms during FX002-T01 quality gates. The current state narrative mentions FX002-T04, but the runtime-decisive lifecycle remains quality_failed. This recovery addresses the executable timeout and leaves lifecycle restoration to the runtime.

## Scope
Allowed:
- `src/doctor/doctorDiagnostics.ts`
- `tests/taskRequestScopeEnforcement.test.ts`

Forbidden:
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/**`
- `docs/features/**`
- `package.json`
- `package-lock.json`

## Constraints
- Execute as doctor recovery with no_review_loop semantics.
- Preserve blocker.kind=unknown, blocker.signature=unknown-quality-failed-fix-002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts-is-in-qua, blocker.recoverability=agent, and observed state lifecycle=quality_failed with active_task=FX002-T01 and no active correction or unblock task.
- Restore exactly lifecycle_state=implementation_running, active_task=FX002-T01, active_correction_task=none, and active_unblock_task=none after recovery gates pass.
- Use only existing source, test, task, and runtime mechanisms; do not invent a manifest, validator, artifact type, or new recovery mechanism from the advisory lesson.
- Do not broaden the recovery into full feature completion, unrelated refactoring, contract changes, state edits, or a new normal task.
- This is a new bounded recovery task, not an evidenced later version of FX002-T01 or FX002-T04; keep previous_task_id null.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The direct cause of the named taskRequestScopeEnforcement timeout is addressed with the smallest change inside the allowed paths.
- The targeted scope-enforcement test completes and passes without merely relying on the advisory refinement or broadening its timeout.
- TypeScript typechecking and diff validation pass.
- No forbidden state, project, contract, configuration, package, or historical task files are modified.
- The recovery remains doctor-only with no reviewer loop, and successful gates permit runtime restoration to the fixed implementation_running target for FX002-T01.

## Files Likely Affected
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/fix.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/doctor/doctorDiagnostics.ts`
- `tests/taskRequestScopeEnforcement.test.ts`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
npm test -- tests/taskRequestScopeEnforcement.test.ts
npm run typecheck
git diff --check
```

## Expected Deliverables
- `code`
- `tests`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: unknown
- signature: unknown-quality-failed-fix-002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts-is-in-qua
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=FX002-T01; active_correction_task=none; active_unblock_task=none
- evidence: Fix 002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `FX002-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
