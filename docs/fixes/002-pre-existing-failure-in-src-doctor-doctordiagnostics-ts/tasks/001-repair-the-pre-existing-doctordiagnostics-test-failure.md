# Task 001: Repair the pre-existing Doctor command test failure

## Task ID
`FX002-T01`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Reproduce the clean-checkout npm test failure, add focused regression coverage in the existing Doctor command test, and make the smallest compatible change in the existing Doctor command implementation that repairs the diagnosed root cause.

## First Executable Step
Run npm test from the repository root and use the failing output to identify a failing behavior in the existing Doctor command before editing either allowed file.

## Minimum Progress Evidence
- tests/doctorCommand.test.ts contains a focused regression test for a reproduced failure in the existing Doctor command behavior.
- src/doctor/doctorCommand.ts contains the minimal source change that addresses that regression.
- The targeted regression test and full npm test command complete successfully.

## Trace
- Roadmap objective: Restore a passing repository test gate so the deterministic CompassRose operation loop can resume blocked feature recovery.
- Feature goal: Repair the blocking defect in the existing Doctor command implementation.
- State gap: The fix is task_planning_pending with no implemented deliverables; its remaining deliverable is to diagnose and repair the root cause of npm test failing.

## Context
- The prior FX002-T01 attempt established that the originally named DoctorDiagnostics source and test paths are absent. Use the existing Doctor command paths below as the repository-grounded implementation and regression-test boundary; do not create the absent paths or fabricate a replacement artifact. The attempt also recorded failures in unrelated tests, which remain blocker evidence and are not a reason to widen this task. Fix 001 separately owns blocked-feature scope misclassification.

## Scope
Allowed:
- `src/doctor/doctorCommand.ts`
- `tests/doctorCommand.test.ts`

Forbidden:
- `Any path outside src/doctor/doctorCommand.ts and tests/doctorCommand.test.ts`
- `src/doctor/doctorDiagnostics.ts`
- `tests/doctor/doctorDiagnostics.test.ts`
- `docs/fixes/001-blocked-feature-scope-misclassification/**`
- `src/contracts/**`
- `docs/compassrose/**`
- `Unrelated feature, fix, configuration, or repository-wide refactoring files`

## Constraints
- Start by reproducing the failure with npm test before editing.
- Use test-guided implementation and add regression coverage for the diagnosed behavior.
- Preserve the existing contracts and documented Doctor command behavior.
- Do not modify blocked-feature scope classification or recovery guidance owned by fix 001.
- Do not modify documentation, project state, contracts, or unrelated files.
- If the reproduced failure does not belong to the two existing allowed paths, keep the task bounded and report the scope mismatch rather than expanding the task or creating the absent paths.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A focused regression test in tests/doctorCommand.test.ts reproduces the pre-fix failure in existing Doctor command behavior and passes after the repair.
- src/doctor/doctorCommand.ts contains the minimal implementation change required by the diagnosed failure.
- npm run typecheck passes.
- npm test passes with zero failures.
- The live diff contains changes only in the two allowed paths and does not duplicate fix 001.

## Files Likely Affected
- `src/doctor/doctorCommand.ts`
- `tests/doctorCommand.test.ts`

## Quality Gates to Run
```bash
npm run typecheck
npm test
```

## Expected Deliverables
- `code`
- `tests`
