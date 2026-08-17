# Task F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R3: Repair the nested preflight correction handoff and recovery evidence

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R3`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R2`

## Parent Feature
`002-configuration-model`

## Goal
Repair the R2 doctor-recovery handoff by restoring the required task-document interface, recording non-empty Implementation Notes, and capturing the nested preflight regression evidence needed for deterministic re-entry while preserving existing configuration validation and repository-root lookup behavior.

## First Executable Step
Run `npx vitest run tests/main.test.ts` from the repository root and capture the baseline before editing any allowed file.

## Minimum Progress Evidence
- Targeted test output demonstrates separate nested repository-root configuration success and role-disabled runtime-precondition failure cases with expected exit codes and diagnostics.
- The correction-handoff artifact contains the required Task ID section, non-empty Implementation Notes justification, and captured implementation or doctor output, changed files, and diff evidence.
- Fresh targeted-test, typecheck, and full-test output is captured with accurate exit statuses before handoff.

## Trace
- Roadmap objective: Connect configuration validation to the Doctor/runtime flow and update state based on approved behavior.
- Feature goal: Complete the F002-T05-C1 correction handoff for nested repository-root configuration resolution and its regression evidence.
- State gap: The feature is blocked because the R2 doctor handoff omitted required Implementation Notes, lacked implementation/context evidence, and has failing or contradictory quality-gate records; the captured task-ready anchor must be restored after bounded recovery.

## Context
- The blocker is agent-recoverable state corruption at the doctor-recovery interface. The existing repository-root lookup and configuration validation are present; the recovery must repair the nested regression fixture/assertions and make the implementation handoff auditable, including reconciliation of the stale passed state record with fresh gate failures.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-repair-the-nested-preflight-regression-evidence-and-review-handoff.md`
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/`
- `proto/`
- `package.json`
- `package-lock.json`
- `all other repository paths`

## Constraints
- Execute as the `doctor` role with `no_review_loop`; do not open a normal reviewer cycle.
- Preserve blocker signature `state-corruption-unblock-pending-implementation-for-f002-t05-c1-correction-handoff-doctor-recove` and the supplied recovery evidence as historical context.
- Preserve the task lineage through `previous_task_id`; do not delete or rewrite the earlier R2 recovery record.
- The nested passing fixture must use the repository-root `docs/compassrose/CONFIG.md` while running from a nested directory with no competing nested configuration.
- The nested failing fixture must exercise the identified role-disabled/runtime-precondition failure, return exit code 1, and preserve the existing diagnostic output.
- Preserve repository-root lookup, configuration validation, preflight diagnostics, and `main(['doctor'])` behavior; do not edit validation or diagnostic logic.
- Limit test edits to the temporary-repository fixture and assertions. Source changes are not expected and may occur only if the baseline proves the requested root-resolution behavior is absent.
- Record the missing Implementation Notes and the mismatch between `state.md` and fresh quality-gate evidence explicitly; do not claim passed gates when commands fail.
- Do not edit feature or project state directly; the runtime restores the captured state after doctor gates pass.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The recovery artifact records executor `doctor`, review policy `no_review_loop`, the exact blocker signature and evidence, and the restoration target.
- The recovery artifact contains non-empty Implementation Notes justification and auditable implementation or doctor progress evidence; it does not hand off with null or missing notes.
- The nested success case loads the repository-root configuration and returns the same successful preflight result as repository-root invocation.
- The nested role-disabled/runtime-precondition case returns exit code 1 with the unchanged expected diagnostic.
- Existing repository-root lookup, configuration validation, and `main(['doctor'])` behavior remain unchanged.
- Fresh quality-gate results and exit statuses are recorded accurately.
- Only the explicitly allowed task artifact and scoped source/test paths are changed; no unrelated files are touched.
- After doctor quality gates pass, the runtime restores `lifecycle_state: task_ready`, `active_task: F002-T05-C1-CORRECTION-HANDOFF`, `active_correction_task: none`, and `active_unblock_task: none.
- The recovery does not enter the normal reviewer loop.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-repair-the-nested-preflight-regression-evidence-and-review-handoff.md`
- `src/cli/main.ts`
- `tests/main.test.ts`

## Quality Gates to Run
```bash
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
- evidence: - signature: state-corruption-unblock-pending-implementation-for-f002-t05-c1-correction-handoff-doctor-recove
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T05-C1-CORRECTION-HANDOFF`
- active_correction_task: `none`
- active_unblock_task: `none`
