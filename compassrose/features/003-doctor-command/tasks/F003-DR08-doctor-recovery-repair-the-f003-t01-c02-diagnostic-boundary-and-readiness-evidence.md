# Task F003-DR08: Doctor recovery: repair the F003-T01-C02 diagnostic boundary and readiness evidence

## Task ID
`F003-DR08`

## Task Lineage

- previous_task_id: `F003-T01-C02`

## Parent Feature
`003-doctor-command`

## Goal
Repair only the existing Doctor diagnostic boundary and its tests so the already-computed runtime facts flow through the feature-owned report boundary, ordered failed readiness is covered, and the recorded implementation task can resume.

## First Executable Step
Add failing assertions in tests/doctor/doctorDiagnostics.test.ts for repositoryRoot, currentPlatform, configPath, and readiness becoming false for an ordered check set containing a failure.

## Minimum Progress Evidence
- A test under tests/doctor/ fails before implementation because the boundary omits the existing runtime facts or does not report failed ordered readiness.
- A source diff under src/doctor/ updates DoctorCheckContext, createCheckContext, buildDiagnosticReport, and existing doctorCommand.ts wiring without null metadata placeholders or post-boundary patching.
- Tests demonstrate ordered all-pass and pass/fail readiness, preserved report metadata and check ordering, configuration non-mutation, success behavior, and exitCode behavior.
- Implementation notes identify the exact changed files and targeted test result.

## Trace
- Roadmap objective: Advance the Doctor diagnostic-contract work on the CompassRose implementation roadmap before later readiness-check and CLI-integration tasks.
- Feature goal: Provide a deterministic, read-only Doctor diagnostic boundary that reports repository readiness clearly and preserves useful failure context.
- State gap: The persisted feature is quality_failed after F003-T01-C02, while the fixed forward restoration target is implementation_running with F003-T01-C02 active; the attempted boundary also lacks existing runtime facts and failed-readiness coverage identified by review.

## Context
- This is a bounded doctor recovery for blocker review-failure-implementation-running-quality-gates-failed-after-implementing-f003-t01-c02-npm-t. Typecheck and the targeted Doctor test passed, but npm test failed in tests/taskRequestScopeEnforcement.test.ts because the test timed out. The review also found that the Doctor diagnostic boundary omits repositoryRoot, currentPlatform, and configPath, uses null report metadata patched after the boundary, and lacks ordered pass/fail readiness coverage. Repair only the existing boundary and tests; do not broaden into unrelated full-suite failures or later feature tasks.

## Scope
Allowed:
- `src/doctor/`
- `tests/doctor/`

Forbidden:
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `src/cli/`
- `docs/compassrose/`
- `docs/features/`
- `compassrose/features/003-doctor-command/state.md`
- `compassrose/PROJECT_STATE.md`
- `tests/taskRequestScopeEnforcement.test.ts`

## Constraints
- Execute as executor_role=doctor with review_policy=no_review_loop; do not enter the normal reviewer loop.
- The blocker is kind=review_failure, recoverability=agent, with signature review-failure-implementation-running-quality-gates-failed-after-implementing-f003-t01-c02-npm-t; preserve that evidence and lineage.
- Restore only this fixed target after every recovery gate passes: lifecycle_state=implementation_running, active_task=F003-T01-C02, active_correction_task=none, active_unblock_task=none.
- Use the existing normalized configurationResult.value and runtime facts already computed by doctorCommand.ts; do not add parsing, validation, configuration models, or readiness checks.
- Keep DoctorCheckContext and DoctorReport readonly from callers, preserve existing shapes, check ordering, metadata, and configuration non-mutation.
- Do not implement repository-readiness checks, CLI integration, or unrelated orchestration and task-scope changes.
- Do not edit tests/taskRequestScopeEnforcement.test.ts or claim the supplied npm test failure passed; the recovery re-entry gates must validate only this recovery boundary and its targeted tests.
- Do not invent a manifest, validator, quality-gate artifact, or other mechanism absent from the supplied contracts.

## Development Policy
- `test_guided`

## Acceptance Criteria
- DoctorCheckContext carries the existing normalized configuration and the already-computed repositoryRoot, currentPlatform, and configPath without reparsing or mutating configuration.
- doctorCommand.ts passes those existing values into the feature-owned boundary, and report construction preserves real metadata on both success and failure paths without null placeholders or post-boundary patching.
- DoctorCheckContext.readiness is covered for ordered all-pass and pass/fail checks; report aggregation preserves check order and derives exitCode 0 only when every check passes, otherwise 1.
- Tests under tests/doctor/ verify runtime-fact preservation, report metadata, configuration non-mutation, readiness, ordering, success, and exitCode behavior.
- Only src/doctor/ and tests/doctor/ are changed; later readiness-check and CLI work remain untouched.
- After the doctor gates pass, the runtime can apply the exact restoration target and resume F003-T01-C02 without creating a correction task or reviewer loop.

## Files Likely Affected
- `src/doctor/doctorDiagnostics.ts`
- `src/doctor/doctorCommand.ts`
- `tests/doctor/doctorDiagnostics.test.ts`
- `compassrose/features/003-doctor-command/tasks/001.2-carry-runtime-facts-through-the-doctor-diagnostic-boundary-and-cover-failed-readiness.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `compassrose/features/003-doctor-command/state.md`
- `compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
npm run typecheck
npx vitest run tests/doctor/doctorDiagnostics.test.ts
git diff --check
```

## Expected Deliverables
- `code`
- `tests`

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
