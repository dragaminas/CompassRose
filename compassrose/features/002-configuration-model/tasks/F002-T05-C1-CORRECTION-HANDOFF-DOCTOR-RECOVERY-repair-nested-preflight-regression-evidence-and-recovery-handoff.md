# Task F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY: Repair nested preflight regression evidence and recovery handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF`

## Parent Feature
`002-configuration-model`

## Goal
Repair the nested preflight regression fixture and assertions, preserve the existing configuration-backed CLI behavior, and capture complete implementation evidence so the recorded task can return to task_ready.

## First Executable Step
Run `npx vitest run tests/main.test.ts` from the repository root to establish the nested success and role-disabled failure baseline before editing either allowed file.

## Minimum Progress Evidence
- Targeted test output demonstrates separate nested success and role-disabled/runtime-precondition failure cases with expected exit codes and diagnostics.
- The diff is limited to `src/cli/main.ts` and/or `tests/main.test.ts`; if the source behavior is already complete, implementation notes explicitly record already-complete evidence and the current commit.
- Fresh targeted-test, typecheck, and full-test results are captured with accurate exit statuses.
- The implementation handoff contains non-empty implementation notes or an explicit already-complete justification.

## Trace
- Roadmap objective: Restore deterministic implementation progress for the repository-local configuration model.
- Feature goal: Connect validated project-level configuration policy to the doctor/runtime preflight with reliable regression coverage.
- State gap: The feature is implementation_failed because F002-T05-C1-CORRECTION-HANDOFF lacks required implementation notes, its fresh quality evidence fails, and the nested preflight failure fixture does not assert the intended failure path.

## Context
- The existing repository-root configuration lookup and validation are present. Recovery is limited to repairing nested-directory regression evidence and completing the failed implementation handoff; it must not redesign preflight behavior.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `Every path other than `src/cli/main.ts` and `tests/main.test.ts``
- `src/config/**`
- `proto/**`
- `tests/protoBlockerFlows.test.ts`
- `tests/protoControlledStop.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `.git/**`

## Constraints
- Execute as `doctor` with `no_review_loop` semantics.
- Keep the existing two-file scope; limit test edits to the temporary-repository fixture and nested success/failure assertions.
- The nested fixture must use the repository-root `CONFIG.md` while running from a nested directory with no competing nested configuration.
- The intended failure case is role-disabled/runtime-precondition failure; it must return exit code 1 with unchanged diagnostic output and must not be satisfied by the success case.
- Preserve repository-root lookup, configuration validation, preflight diagnostics, and `main(['doctor'])` behavior.
- If the requested source behavior already exists, do not manufacture a source diff; record explicit already-complete justification and current-commit evidence.
- Do not rely on the stale quality status in `state.md`; capture fresh gate output and reconcile the implementation handoff evidence.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A nested passing fixture loads the repository-root configuration and returns the same successful preflight result as the repository-root invocation.
- A nested role-disabled/runtime-precondition fixture returns exit code 1 with the unchanged expected diagnostic.
- Only the nested fixture and related assertions change; existing preflight validation and diagnostic logic remain behaviorally unchanged.
- `main(['doctor'])` remains behaviorally unchanged.
- Implementation notes or an explicit already-complete justification, current-commit evidence, and fresh quality-gate results are captured.
- After doctor gates pass, the runtime restores `task_ready` with active task `F002-T05-C1-CORRECTION-HANDOFF` and clears active correction and unblock tasks.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `.git/proto-compassrose/implementation-attempts/F002-T05-C1-CORRECTION-HANDOFF.json`
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

- kind: state_corruption
- signature: state-corruption-implementation-failed-feature-002-configuration-model-is-in-implementation-fail
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=F002-T05-C1-CORRECTION-HANDOFF; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: implementation_failure
- evidence: - signature: implementation-failure-F002-T05-C1-CORRECTION-HANDOFF
- evidence: - recoverability: agent
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T05-C1-CORRECTION-HANDOFF`
- active_correction_task: `none`
- active_unblock_task: `none`
