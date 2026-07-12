# Task F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R5: Repair nested preflight regression evidence and correction handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R5`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R4`

## Parent Feature
`002-configuration-model`

## Goal
Repair the narrowly scoped nested preflight regression fixture and complete the missing implementation-notes and verification evidence for F002-T05-C1-CORRECTION-HANDOFF, then restore its task-ready anchor.

## First Executable Step
Run `npx vitest run tests/main.test.ts` from the repository root to establish the baseline for the nested passing and role-disabled/runtime-precondition failure cases before editing either allowed file.

## Minimum Progress Evidence
- Targeted test output demonstrates separate nested success and nested runtime-precondition-failure cases with the expected exit codes and diagnostics.
- A diff is present only in `tests/main.test.ts` and/or `src/cli/main.ts`, unless implementation notes explicitly document already-complete evidence and the current commit.
- Fresh typecheck and full-test output is captured with accurate exit status before handoff.
- The implementation artifact contains non-empty `implementation.notes` or an explicit already-complete justification and records the missing artifact and evidence-bookkeeping defect.

## Trace
- Roadmap objective: Resume deterministic execution of the configuration-model feature after recoverable implementation failure.
- Feature goal: Connect validated configuration policy to CLI/runtime preflight while preserving existing configuration validation and doctor behavior.
- State gap: The feature is implementation_failed because the correction handoff lacks implementation notes, mandatory tests fail, and recorded quality-gate evidence is stale or inconsistent.

## Context
- Repository-root configuration lookup is already present. Recovery is limited to repairing the nested regression fixture and producing complete, fresh handoff evidence; preserve existing preflight validation and diagnostics.

## Scope
Allowed:
- `tests/main.test.ts`
- `src/cli/main.ts`

Forbidden:
- `All other repository paths.`
- `Changes to preflight validation or diagnostic logic unless the targeted baseline proves the existing behavior is absent and the minimal correction is justified.`
- `Changes outside the temporary-repository nested success/failure fixture and its assertions.`
- `Manual edits to implementation-attempt artifacts or state documents; their evidence and restoration records must be captured by the runtime.`

## Constraints
- Execute as the `doctor` role with `no_review_loop` semantics.
- The nested passing fixture must load the repository-root CONFIG.md from a nested directory with no competing nested configuration.
- The failure fixture must exercise the identified role-disabled/runtime-precondition case, return the expected nonzero exit code, and preserve diagnostic output.
- Preserve existing repository-root lookup, configuration validation, and `main(['doctor'])` behavior.
- Fresh command output takes precedence over stale state.md or prior quality-gate records.
- If the source behavior already exists, preserve src/cli/main.ts and explicitly record already-complete evidence and the current commit.
- Do not erase or rewrite the failed implementation evidence.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The nested passing fixture loads the repository-root configuration and matches the repository-root preflight success result.
- The nested role-disabled/runtime-precondition fixture returns the expected failure exit code and unchanged diagnostic output.
- `main(['doctor'])` remains behaviorally unchanged.
- The implementation artifact contains non-empty implementation notes, or an explicit already-complete justification with commands, exit statuses, changed-file/diff results, and limitations.
- All recovery gates pass with freshly captured, accurate results.
- After the gates pass, the runtime restores lifecycle_state `task_ready`, active_task `F002-T05-C1-CORRECTION-HANDOFF`, active_correction_task `none`, and active_unblock_task `none.

## Files Likely Affected
- `tests/main.test.ts`
- `src/cli/main.ts`
- `.git/proto-compassrose/implementation-attempts/F002-T05-C1-CORRECTION-HANDOFF.json`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

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
