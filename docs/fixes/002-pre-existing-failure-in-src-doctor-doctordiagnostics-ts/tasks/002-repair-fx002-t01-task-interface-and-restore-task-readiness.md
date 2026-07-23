# Task 002: Repair FX002-T01 task interface and restore task readiness

## Task ID
`FX002-T02`

## Task Lineage

- previous_task_id: `FX002-T01`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Tighten the recorded FX002-T01 task interface so the next implementation attempt is grounded in repository evidence, then restore the exact task-ready anchor.

## First Executable Step
Get-Content -Raw -LiteralPath 'docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md'

## Minimum Progress Evidence
- The active task definition has a non-empty working-tree diff against the explicit pre-recovery ref HEAD^.
- The revised task no longer requires the nonexistent DoctorDiagnostics source and test paths or asks the implementer to fabricate them.
- Changed-file evidence shows no source, test, contract, or implementation-attempt artifact was modified by recovery.

## Trace
- Roadmap objective: Restore deterministic CompassRose execution after a recoverable implementation failure.
- Feature goal: Repair the pre-existing npm test blocker and allow blocked work to resume.
- State gap: The fix is implementation_failed with active_task FX002-T01, no correction or unblock task, and no implementation diff; it must return to task_ready with the same active task anchor.

## Context
- FX002-T01 produced no changed files or git diff and was classified as context_overflow. Its preserved implementation output also reports that the named DoctorDiagnostics source and test files do not exist. This recovery is limited to repairing that task interface and restoring readiness; it must not guess or implement the underlying npm test fix.

## Scope
Allowed:
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/**`
- `tests/**`
- `src/contracts/**`
- `.git/proto-compassrose/implementation-attempts/FX002-T01.json`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/fix.md`
- `docs/features/**`
- `other docs/fixes/**`

## Constraints
- Execute with executor_role doctor and review_policy no_review_loop.
- Preserve blocker signature implementation-failure-FX002-T01 and the failed implementation attempt as historical evidence.
- Do not create placeholder source or test files for paths absent from the repository.
- Do not invent a manifest, validator, artifact type, or new contract mechanism.
- Do not repair the underlying npm test failure in this recovery task.
- The runtime, not the doctor task, must restore lifecycle_state task_ready with active_task FX002-T01, active_correction_task none, and active_unblock_task none.
- Use HEAD^ as the explicit pre-recovery commit reference in diff gates.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The recorded FX002-T01 task interface is revised to use repository-grounded paths and executable progress requirements.
- The revised interface does not require the nonexistent DoctorDiagnostics source or test files and does not instruct the implementer to fabricate them.
- The original FX002-T01 attempt artifact remains unchanged and the recovery preserves lineage through previous_task_id FX002-T01.
- No source, test, contract, or unrelated feature/fix files are changed.
- After the recovery gates pass, deterministic runtime restoration uses exactly task_ready, FX002-T01, none, none.

## Files Likely Affected
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `.git/proto-compassrose/implementation-attempts/FX002-T01.json`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check
git diff --check HEAD^ -- "docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md"
git diff --exit-code HEAD^ -- "src/doctor/doctorDiagnostics.ts" "tests/doctor/doctorDiagnostics.test.ts"
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-implementation-failed-fix-002-pre-existing-failure-in-src-doctor-doctordiagnost
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=FX002-T01; active_correction_task=none; active_unblock_task=none
- evidence: Fix 002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts is in implementation_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: implementation_failure
- evidence: - signature: implementation-failure-FX002-T01
- evidence: - recoverability: agent
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `FX002-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
