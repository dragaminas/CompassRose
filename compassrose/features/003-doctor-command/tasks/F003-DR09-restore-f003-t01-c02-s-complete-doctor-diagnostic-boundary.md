# Task F003-DR09: Restore F003-T01-C02’s complete doctor diagnostic boundary

## Task ID
`F003-DR09`

## Task Lineage

- previous_task_id: `F003-DR08`

## Parent Feature
`003-doctor-command`

## Goal
Repair the feature-owned Doctor diagnostic boundary so the existing runtime facts repositoryRoot, currentPlatform, and configPath flow through context and report construction, ordered pass/fail readiness is covered, and F003-T01-C02 can resume at the fixed implementation_running restoration target.

## First Executable Step
Add failing assertions in tests/doctor/doctorDiagnostics.test.ts for runtime-fact propagation and readiness=false for an ordered DoctorCheck set containing a failed check, then run npx vitest run tests/doctor/doctorDiagnostics.test.ts.

## Minimum Progress Evidence
- A targeted test fails before implementation when repositoryRoot, currentPlatform, or configPath is absent or null at the diagnostic boundary.
- A targeted test fails before implementation when an ordered DoctorCheck set contains a failed check but readiness is not false.
- A source diff in src/doctor/doctorDiagnostics.ts and src/doctor/doctorCommand.ts removes null-placeholder metadata and post-boundary report patching.
- The targeted Doctor tests pass after the boundary and wiring are corrected.
- npm run typecheck passes.
- The recorded npm test failure remains truthful failed evidence and is not recorded as passed or silently converted into an unrelated scope fix.

## Trace
- Roadmap objective: Provide a deterministic, read-only compassrose doctor preflight command that reports repository readiness and useful failures.
- Feature goal: Complete the feature-owned structured Doctor diagnostic boundary and its automated coverage without changing the configuration model, CLI scope, or broader orchestration.
- State gap: Feature 003-doctor-command is quality_failed with active task F003-T01-C02, while the runtime requires restoration to implementation_running with that same active task and no correction or unblock task.

## Context
- The latest review found that F003-T01-C02 omits existing runtime facts from DoctorCheckContext and DoctorReport, hard-codes report metadata to null, patches the report after the diagnostic boundary, and lacks readiness coverage for an ordered pass/fail DoctorCheck set. The targeted Doctor tests and typecheck passed, while npm test failed in tests/taskRequestScopeEnforcement.test.ts; that unrelated failure must remain accurately recorded. This recovery is the successor to F003-DR08 and does not replace the F003-T01-C02 task anchor.

## Scope
Allowed:
- `src/doctor/doctorDiagnostics.ts`
- `src/doctor/doctorCommand.ts`
- `tests/doctor/doctorDiagnostics.test.ts`
- `compassrose/features/003-doctor-command/state.md`
- `compassrose/PROJECT_STATE.md`

Forbidden:
- `src/config/**`
- `src/orchestrator/**`
- `src/cli/**`
- `src/adapters/**`
- `src/roles/**`
- `src/git/**`
- `tests/taskRequestScopeEnforcement.test.ts`
- `src/contracts/**`
- `docs/compassrose/**`
- `docs/features/**`
- `Later Doctor readiness checks or CLI expansion`
- `New manifests, validators, artifact types, or quality-gate mechanisms`
- `Unrelated fixes to the full test suite`
- `Changing the fixed restoration target`

## Constraints
- doctor recovery executor_role is doctor.
- review_policy is no_review_loop; do not enter the normal reviewer loop.
- Use test_guided development.
- Restore exactly lifecycle_state=implementation_running, active_task=F003-T01-C02, active_correction_task=none, and active_unblock_task=none after every recovery gate passes.
- Use the existing ordered DoctorCheck results and existing runtime facts; do not invent a new runtime artifact or mechanism.
- Preserve configuration non-mutation, report check ordering, success behavior, and exitCode behavior.
- Use only the recovery gates listed here as the complete doctor re-entry gate set; do not inherit the active task’s failed npm test gate.
- Do not claim npm test passed while tests/taskRequestScopeEnforcement.test.ts still fails.
- No files are modified by this planning turn.

## Development Policy
- `test_guided`

## Acceptance Criteria
- DoctorCheckContext and DoctorReport carry the existing normalized configuration plus repositoryRoot, currentPlatform, and configPath through the feature-owned boundary without null placeholders.
- doctorCommand.ts passes those already-computed runtime facts into the boundary after configuration loading and obtains the final report from the boundary on both success and failure paths without post-boundary metadata patching.
- DoctorCheckContext.readiness is derived from the existing ordered DoctorCheck results, with tests covering both an all-pass set and a pass/fail set where readiness is false.
- Existing coverage for check ordering, configuration non-mutation, successful reporting, and exitCode behavior remains passing.
- The recovery stays within the allowed Doctor source, Doctor tests, and required feature/project state restoration scope.
- The known npm test failure is preserved as failed evidence rather than marked passed, waived through an invented mechanism, or fixed by widening scope into tests/taskRequestScopeEnforcement.test.ts.
- After all listed recovery gates pass, the runtime applies exactly the recorded implementation_running restoration target and clears active_unblock_task.

## Files Likely Affected
- `src/doctor/doctorDiagnostics.ts`
- `src/doctor/doctorCommand.ts`
- `tests/doctor/doctorDiagnostics.test.ts`
- `compassrose/features/003-doctor-command/state.md`
- `compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
npx vitest run tests/doctor/doctorDiagnostics.test.ts
npm run typecheck
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagno
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F003-T01-C02; active_correction_task=none; active_unblock_task=none
- evidence: Feature 003-doctor-command is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: review_failure
- evidence: - signature: review-failure-implementation-running-quality-gates-failed-after-implementing-f003-t01-c02-npm-t
- evidence: - recoverability: agent
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F003-T01-C02`
- active_correction_task: `none`
- active_unblock_task: `none`
