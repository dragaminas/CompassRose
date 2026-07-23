# Task 003: Repair the reported npm test timeout before retrying FX002-T01

## Task ID
`FX002-T03`

## Task Lineage

- previous_task_id: `FX002-T01`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Reproduce and repair the directly implicated quality-gate failure in the DoctorDiagnostics/task-scope path, then leave FX002-T01 ready for deterministic retry.

## First Executable Step
Run `npm test -- tests/taskRequestScopeEnforcement.test.ts` to reproduce the reported timeout before editing any file.

## Minimum Progress Evidence
- A non-empty diff exists only in the allowed source/test paths and contains a cause-directed repair.
- The targeted test completes without timing out and passes.
- The configured typecheck and full test gates pass.

## Trace
- Roadmap objective: Restore deterministic execution of the active pre-existing-test-failure fix.
- Feature goal: Repair the blocking DoctorDiagnostics test failure so the fix can complete and unblock dependent work.
- State gap: The fix is quality_failed after FX002-T01 quality gates failed; runtime must restore implementation_running with active task FX002-T01.

## Context
- The fix is in quality_failed with FX002-T01 active. The supplied refinement reports an npm test timeout in tests/taskRequestScopeEnforcement.test.ts, but that report is advisory and must be verified first. FX002-T02 is recorded as a prior passed doctor recovery and remains historical evidence.

## Scope
Allowed:
- `src/doctor/doctorDiagnostics.ts`
- `tests/taskRequestScopeEnforcement.test.ts`

Forbidden:
- `All other src/** paths`
- `All other tests/** paths`
- `docs/** state, project, feature, fix, or task documents`
- `src/contracts/**`
- `package*.json`
- `tsconfig*.json`
- `Global or user-level configuration files`

## Constraints
- Execute as doctor with review_policy no_review_loop.
- Preserve blocker signature unknown-quality-failed-fix-002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts-is-in-qua and all prior recovery evidence.
- Treat the reported timeout as advisory until the first executable step reproduces or localizes it; do not guess a root cause.
- Make only a cause-directed change in the allowed source/test paths; do not weaken assertions or use a timeout-only change without evidence that the intended contract requires it.
- Do not modify feature state or project state; runtime owns restoration to the fixed target.
- Preserve FX002-T02 as historical evidence and do not delete or rewrite the earlier FX002-T01 task.
- Do not invent manifests, validators, or new artifact types.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The reported taskRequestScopeEnforcement test timeout is reproduced or conclusively localized before repair.
- The targeted test completes deterministically without weakening its intended refusal/containment behavior.
- The minimal repair is confined to src/doctor/doctorDiagnostics.ts and/or tests/taskRequestScopeEnforcement.test.ts.
- npm run typecheck and npm test pass.
- The recovery leaves the recorded FX002-T01 anchor available for runtime restoration without changing lifecycle state documents.

## Files Likely Affected
- `src/doctor/doctorDiagnostics.ts`
- `tests/taskRequestScopeEnforcement.test.ts`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/task/doctor-recovery-task.md`

## Quality Gates to Run
```bash
npm test -- tests/taskRequestScopeEnforcement.test.ts
npm run typecheck
npm test
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
