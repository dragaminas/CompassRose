# Task F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R2: Doctor recovery: repair the nested preflight handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R2`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY`

## Parent Feature
`002-configuration-model`

## Goal
Recover the failed F002-T05-C1 handoff by repairing the nested preflight regression fixture and malformed task handoff metadata, capturing implementation evidence and fresh quality-gate results, then restoring the recorded task anchor.

## First Executable Step
From the repository root, run `npx vitest run tests/main.test.ts` before editing either allowed file and record the nested success and role-disabled failure results.

## Minimum Progress Evidence
- Targeted test output demonstrates separate nested success and role-disabled/runtime-precondition-failure cases with expected exit codes and diagnostics.
- A non-empty diff is present in `tests/main.test.ts`, limited to the temporary-repository fixture and nested success/failure assertions.
- The active task handoff contains a valid `## Task ID` section and non-empty implementation notes, stored output, or an explicit already-complete justification with current-commit evidence.
- Fresh typecheck and full-test output is captured with accurate exit statuses.

## Trace
- Roadmap objective: Connect the validated project-local configuration model to the CompassRose doctor/runtime flow.
- Feature goal: Complete the configuration-model runtime handoff while preserving the existing repository-root preflight behavior.
- State gap: The active doctor recovery produced no diff due to context overflow; implementation notes and context artifacts are missing, the task handoff is malformed, and mandatory tests disagree with recorded state evidence.

## Context
- The recoverable blocker is not pure state drift: the prior doctor recovery produced no git diff, omitted implementation notes and context artifacts, and left stale quality-gate evidence. Fresh npm test reports failures including nested role-disabled preflight behavior and a malformed handoff missing `## Task ID`. The existing repository-root lookup and configuration validation are already present and must be preserved. The runtime must use the supplied restoration target after doctor gates pass.

## Scope
Allowed:
- `tests/main.test.ts`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-repair-the-nested-preflight-regression-evidence-and-review-handoff.md`

Forbidden:
- `src/cli/main.ts`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `Any provider or global configuration files`
- `Any unrelated source, test, documentation, or feature files`

## Constraints
- executor_role: doctor
- review_policy: no_review_loop
- blocker.kind: state_corruption
- blocker.signature: state-corruption-unblock-pending-implementation-for-f002-t05-c1-correction-handoff-doctor-recove
- blocker.recoverability: agent
- observed_state: lifecycle=unblock_pending; active_task=F002-T05-C1-CORRECTION-HANDOFF; active_correction_task=none; active_unblock_task=F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY
- Preserve the earlier recovery task as history and do not silently replace or delete it.
- Use the repository-root `docs/compassrose/CONFIG.md` from a nested working directory; the nested fixture must not contain a competing nested configuration.
- Make the role-disabled/runtime-precondition failure explicit, with the expected exit code `1` and unchanged diagnostic, so a successful preflight cannot satisfy the failure case.
- Repair only the temporary-repository fixture and nested success/failure assertions in `tests/main.test.ts`; preserve the existing `src/cli/main.ts` root lookup, validation, and diagnostics.
- Repair the active task handoff so it is parseable, includes the required task identity, and records non-empty implementation notes/output/context evidence or an explicit already-complete justification.
- Run the required gates in fresh order and do not rely on stale `state.md` quality-gate claims when command output disagrees.
- Do not manually rewrite lifecycle state during execution; after doctor gates pass, restore `lifecycle_state: task_ready`, `active_task: F002-T05-C1-CORRECTION-HANDOFF`, `active_correction_task: none`, and `active_unblock_task: none`.
- This recovery must not enter the normal reviewer loop.

## Development Policy
- `test_guided`

## Acceptance Criteria
- From a nested directory, the passing fixture loads the repository-root configuration and returns the same successful preflight result as the repository-root invocation.
- From a nested directory, the specified role-disabled/runtime-precondition fixture returns exit code `1` with unchanged diagnostic output.
- `main(['doctor'])` remains behaviorally unchanged.
- The active task handoff is parseable, includes `## Task ID`, and preserves explicit implementation notes and evidence rather than silently accepting a missing artifact.
- The implementation diff is limited to the intended nested preflight test fixture/assertions; the existing source behavior remains preserved.
- All mandatory quality gates pass with freshly captured output and accurate status.
- After the gates pass, the runtime restores the captured `task_ready` lifecycle and active-task anchor.

## Files Likely Affected
- `tests/main.test.ts`
- `src/cli/main.ts`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-repair-the-nested-preflight-regression-evidence-and-review-handoff.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check
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
