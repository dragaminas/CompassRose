# Task 001: Repair the pre-existing DoctorDiagnostics test failure

## Task ID
`FX002-T01`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Reproduce the clean-checkout npm test failure, add focused regression coverage, and make the smallest compatible change in src/doctor/doctorDiagnostics.ts that repairs the diagnosed root cause.

## First Executable Step
Run npm test from the repository root and use the failing DoctorDiagnostics test output to identify the failing behavior before editing either allowed file.

## Minimum Progress Evidence
- tests/doctor/doctorDiagnostics.test.ts contains a focused regression test for the reproduced failure.
- src/doctor/doctorDiagnostics.ts contains the minimal source change that addresses that regression.
- The targeted regression test and full npm test command complete successfully.

## Trace
- Roadmap objective: Restore a passing repository test gate so the deterministic CompassRose operation loop can resume blocked feature recovery.
- Feature goal: Repair the blocking defect in src/doctor/doctorDiagnostics.ts.
- State gap: The fix is task_planning_pending with no implemented deliverables; its remaining deliverable is to diagnose and repair the root cause of npm test failing.

## Context
- Fix 002 is formalized and has no active task, blockers, or implemented deliverables. The persisted planning hint is to diagnose and repair npm test. Keep the change limited to the DoctorDiagnostics implementation and its regression test; fix 001 separately owns blocked-feature scope misclassification.

## Scope
Allowed:
- `src/doctor/doctorDiagnostics.ts`
- `tests/doctor/doctorDiagnostics.test.ts`

Forbidden:
- `Any path outside src/doctor/doctorDiagnostics.ts and tests/doctor/doctorDiagnostics.test.ts`
- `docs/fixes/001-blocked-feature-scope-misclassification/**`
- `src/contracts/**`
- `docs/compassrose/**`
- `Unrelated feature, fix, configuration, or repository-wide refactoring files`

## Constraints
- Start by reproducing the failure with npm test before editing.
- Use test-guided implementation and add regression coverage for the diagnosed behavior.
- Preserve the existing contracts and documented DoctorDiagnostics behavior.
- Do not modify blocked-feature scope classification or recovery guidance owned by fix 001.
- Do not modify documentation, project state, contracts, or unrelated files.
- If the failure cannot be repaired within the allowed paths, keep the task bounded and report the scope mismatch rather than expanding the task.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A focused regression test in tests/doctor/doctorDiagnostics.test.ts reproduces the pre-fix failure and passes after the repair.
- src/doctor/doctorDiagnostics.ts contains the minimal implementation change required by the diagnosed failure.
- npm run typecheck passes.
- npm test passes with zero failures.
- The live diff contains changes only in the two allowed paths and does not duplicate fix 001.

## Files Likely Affected
- `src/doctor/doctorDiagnostics.ts`
- `tests/doctor/doctorDiagnostics.test.ts`

## Quality Gates to Run
```bash
npm run typecheck
npm test
```

## Expected Deliverables
- `code`
- `tests`
