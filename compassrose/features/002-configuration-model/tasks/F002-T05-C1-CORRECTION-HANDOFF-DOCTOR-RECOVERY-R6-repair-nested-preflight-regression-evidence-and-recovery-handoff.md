# Task F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R6: Repair nested preflight regression evidence and recovery handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R6`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF`

## Parent Feature
`002-configuration-model`

## Goal
Repair the nested preflight test fixture so repository-root configuration resolution is proven for both success and role-disabled failure, while capturing explicit implementation evidence and notes for re-entry of the recorded correction handoff.

## First Executable Step
Run `npx vitest run tests/main.test.ts` from the repository root to establish the baseline for the nested passing and failing preflight cases before editing either allowed file.

## Minimum Progress Evidence
- Targeted test output demonstrates separate nested success and nested runtime-precondition-failure cases with the expected exit codes and diagnostics.
- A diff is present only in `src/cli/main.ts` and/or `tests/main.test.ts`, unless implementation notes explicitly document already-complete evidence.
- Fresh typecheck and full-test output is captured with accurate exit status before handoff.
- The implementation artifact contains non-empty implementation notes or an explicit already-complete justification with current-commit evidence; missing implementer output, context artifacts, or diff capture is recorded as an execution defect.

## Trace
- Roadmap objective: Make the repository-local configuration model validated and usable by the Doctor/runtime flow.
- Feature goal: Connect the documented project configuration contract to reliable Doctor/runtime preflight behavior without changing provider integration or global configuration.
- State gap: Feature 002-configuration-model is quality_failed: the correction handoff has failing nested preflight evidence, missing implementation capture, absent context artifacts, empty diff evidence, and inconsistent quality-gate bookkeeping.

## Context
- Bounded doctor recovery for the recoverable unknown blocker reported after F002-T05-C1-CORRECTION-HANDOFF. Existing repository-root resolution and configuration validation are already present; the recovery must repair the nested regression fixture, preserve the existing CLI behavior, and make the implementation handoff auditable before restoring the recorded task anchor.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `proto/protoCompassRose.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/**`
- `docs/compassrose/CONFIG.md`
- `src/**`
- `tests/**`
- `Any global or user configuration path`

## Constraints
- Execute as the `doctor` role with `review_policy=no_review_loop`; do not enter the normal reviewer loop.
- Blocker metadata: kind=unknown; signature=unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-; recoverability=agent; observed_state=lifecycle=quality_failed, active_task=F002-T05-C1-CORRECTION-HANDOFF, active_correction_task=none, active_unblock_task=none.
- After doctor gates pass, restore lifecycle_state=task_ready, active_task=F002-T05-C1-CORRECTION-HANDOFF, active_correction_task=none, and active_unblock_task=none.
- The nested passing fixture must load the repository-root `docs/compassrose/CONFIG.md` while running from a nested directory with no competing nested configuration.
- The nested failing fixture must exercise the identified role-disabled/runtime-precondition failure, assert exit code 1, and preserve the existing diagnostic output; a successful preflight must not satisfy the failure case.
- Preserve the existing repository-root lookup, configuration validation, preflight validation, diagnostic logic, and `main(['doctor'])` behavior; do not redesign or refactor them.
- Limit test edits to the temporary-repository fixture and assertions for nested success/failure; preserve `src/cli/main.ts` unless targeted evidence proves a minimal correction is required.
- Record missing implementation output, context artifacts, and implementation.notes explicitly as execution defects; do not infer implementer intent from an empty diff.
- Do not edit feature state or project state during the recovery; deterministic runtime restoration owns those updates.

## Development Policy
- `test_guided`

## Acceptance Criteria
- From a nested directory, the passing fixture loads the repository-root configuration and returns the same successful preflight result as the repository-root invocation.
- From a nested directory, the specified role-disabled/runtime-precondition fixture returns exit code 1 with unchanged diagnostic output.
- `main(['doctor'])` remains behaviorally unchanged.
- The existing repository-root resolution and configuration validation remain intact; no unrelated source or diagnostic changes are introduced.
- The implementation artifact explicitly records non-empty implementation notes or an already-complete justification with current-commit and verification evidence; missing output or context artifacts are identified rather than silently omitted.
- All mandatory quality gates are freshly captured and pass in the order specified.
- After the doctor gates pass, the runtime restores the captured quality_failed lifecycle and active-task anchor without creating an active correction or unblock task.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-repair-the-nested-preflight-regression-evidence-and-review-handoff.md`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
```

## Expected Deliverables
- `tests`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: unknown
- signature: unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T05-C1-CORRECTION-HANDOFF; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T05-C1-CORRECTION-HANDOFF`
- active_correction_task: `none`
- active_unblock_task: `none`
