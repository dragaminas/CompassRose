# Task F002-T07-C2-DOCTOR-RECOVERY-R1: Enforce MVP external_cli-only role wiring

## Task ID
`F002-T07-C2-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T07-C2`

## Parent Feature
`002-configuration-model`

## Goal
Correct runtime preflight validation so enabled roles accept only the generic external_cli adapter, then restore the recorded F002-T07-C2 implementation anchor.

## First Executable Step
Edit tests/main.test.ts to add failing cases where each enabled planner, implementer, and reviewer role references a defined adapter other than external_cli, asserting exit code 1 with roles.<role>.adapter and runtime preflight diagnostics.

## Minimum Progress Evidence
- tests/main.test.ts contains rejection coverage for defined non-external adapters, while retaining missing-adapter and valid external_cli coverage.
- src/config/configReader.ts enforces adapter === external_cli for enabled planner, implementer, and reviewer roles.
- Focused tests, typecheck, full tests, and diff checks pass.

## Trace
- Roadmap objective: Connect the repository-local configuration contract to deterministic runtime policy consumption.
- Feature goal: Use project-local configuration to validate runtime policy without provider-specific adapters or global-tool mutation.
- State gap: F002-T07-C2 is quality_failed because validation accepts any defined adapter key instead of enforcing the documented MVP external_cli-only role wiring.

## Context
- CONFIG.md states that the MVP supports only one generic external CLI adapter and that provider-specific adapters are out of scope. The failed implementation validates adapter-key existence but allows defined non-external keys, so adapter-name existence is insufficient. Valid external_cli wiring and the existing field-specific missing-adapter preflight behavior must remain intact.

## Scope
Allowed:
- `src/config/configReader.ts`
- `tests/main.test.ts`

Forbidden:
- `docs/`
- `src/cli/`
- `src/contracts/`
- `proto/`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `all tests except tests/main.test.ts`
- `all source files except src/config/configReader.ts`
- `docs/features/002-configuration-model/tasks/`

## Constraints
- Execute as doctor with review_policy no_review_loop.
- Preserve the blocker signature, prior task, and recovery evidence; do not delete or rewrite F002-T07-C2.
- Restore exactly to lifecycle_state implementation_running with active_task F002-T07-C2 and no active correction or unblock task.
- Keep the change limited to MVP external_cli-only semantics; do not add provider-specific adapters, manifests, validators, or global-tool changes.
- Use test_guided development and preserve successful external_cli no-task behavior.

## Development Policy
- `test_guided`

## Acceptance Criteria
- An enabled planner, implementer, or reviewer using a defined adapter other than external_cli produces a roles.<role>.adapter runtime-preflight issue and main([]) returns exit code 1.
- An enabled role referencing a missing adapter still produces the existing field-specific roles.<role>.adapter runtime-preflight diagnostic.
- Valid project configuration with enabled roles wired to external_cli continues to pass successful no-task behavior without adapter invocation or state mutation.
- The typed adapters.external_cli configuration remains the accepted MVP adapter entry, and additional adapter keys do not expand supported runtime behavior.
- Only src/config/configReader.ts and tests/main.test.ts are modified; all doctor re-entry quality gates pass.

## Files Likely Affected
- `docs/compassrose/CONFIG.md`
- `src/config/configReader.ts`
- `src/cli/main.ts`
- `tests/main.test.ts`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts tests/configReader.test.ts
npm run typecheck
npm test
git diff --check -- src/config/configReader.ts tests/main.test.ts
```

## Expected Deliverables
- `code`
- `tests`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: unknown
- signature: unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T07-C2; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T07-C2`
- active_correction_task: `none`
- active_unblock_task: `none`
