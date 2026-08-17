# Task F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R4: Repair the C1 nested-preflight correction handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R4`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R3`

## Parent Feature
`002-configuration-model`

## Goal
Remove the failed R3 re-entry blocker by repairing the nested preflight regression fixture and C1 review handoff evidence while preserving existing repository-root configuration lookup and validation, so doctor gates pass and the runtime restores task_ready for F002-T05-C1-CORRECTION-HANDOFF.

## First Executable Step
From the repository root, run `npx vitest run tests/main.test.ts`.

## Minimum Progress Evidence
- Targeted test output demonstrates separate nested success and role-disabled/runtime-precondition-failure cases with the expected exit codes and unchanged diagnostics.
- A non-empty diff is present only in tests/main.test.ts and/or the recorded C1 handoff task document; no source, runtime, state, or contract changes are introduced.
- The C1 handoff records the missing implementation output/context and missing implementation.notes as execution defects, or records explicit already-complete evidence when no source diff is required.
- Fresh successful output and exit status are captured for npm run typecheck and npm test.

## Trace
- Roadmap objective: Make CompassRose's repository-local configuration model usable by runtime policy and doctor preflight.
- Feature goal: Connect configuration validation to the doctor/runtime flow and prove the documented configuration model through approved implementation tasks and quality gates.
- State gap: The feature is blocked in unblock_pending because doctor recovery R3 failed its re-entry gates; restore the recorded C1 task anchor to task_ready after repairing the handoff and regression evidence.

## Context
- The existing C1 implementation behavior is present and repository-root scoped, but its recovery handoff is incomplete: the nested role-disabled failure fixture returns success, npm test reports reviewable-handoff parsing failures, and implementation output, context artifacts, and notes were not captured. Repair only the nested fixture/assertions and the C1 handoff evidence, then allow the runtime to restore the captured task_ready state.

## Scope
Allowed:
- `tests/main.test.ts`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-repair-the-nested-preflight-regression-evidence-and-review-handoff.md`

Forbidden:
- `src/cli/main.ts`
- `tests/protoReviewableDiffHandoff.test.ts`
- `proto/`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/`
- `docs/compassrose/CONFIG.md`
- `all other feature, source, test, task, and global configuration paths`

## Constraints
- Execute as the doctor role with no_review_loop semantics.
- Use the repository-root docs/compassrose/CONFIG.md from a nested fixture with no competing nested configuration.
- Limit test edits to the temporary-repository nested success/failure fixture and its assertions.
- Keep the role-disabled/runtime-precondition failure explicit; it must not be satisfied by a passing preflight case.
- Preserve the existing repository-root lookup, configuration validation, diagnostics, and main(['doctor']) behavior.
- Do not treat an empty implementation diff as silently complete; require non-empty implementation notes or an explicit already-complete justification and preserve missing-artifact diagnostics.
- Do not modify feature or project state directly; successful doctor gates cause runtime restoration to the recorded target.

## Development Policy
- `test_guided`

## Acceptance Criteria
- From a nested directory, the passing fixture loads the repository-root configuration and returns the same successful preflight result as repository-root invocation.
- From a nested directory, the specified role-disabled/runtime-precondition fixture returns exit code 1 with the unchanged expected diagnostic.
- main(['doctor']) remains behaviorally unchanged.
- The existing src/cli/main.ts repository-root resolution and configuration validation remain untouched.
- The C1 handoff contains the concrete nested-fixture context, intended failing precondition, expected exit code and diagnostic, narrow two-file scope, required evidence, and fresh quality-gate requirements.
- The reviewable handoff no longer fails because a required Task ID section is absent, and implementation.notes or an explicit already-complete justification is recorded.
- All doctor re-entry quality gates pass; the runtime then restores lifecycle_state task_ready with active_task F002-T05-C1-CORRECTION-HANDOFF and no active correction or unblock task.

## Files Likely Affected
- `tests/main.test.ts`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-repair-the-nested-preflight-regression-evidence-and-review-handoff.md`
- `src/cli/main.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check
npx vitest run tests/main.test.ts
npm run typecheck
npm test
```

## Expected Deliverables
- `tests`
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F002-T05-C1-CORRECTION-HANDOFF; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-unblock-pending-doctor-recovery-f002-t05-c1-correction-handoff-doctor-recovery-
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T05-C1-CORRECTION-HANDOFF`
- active_correction_task: `none`
- active_unblock_task: `none`
