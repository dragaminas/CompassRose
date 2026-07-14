# Task F002-T10-DOCTOR-RECOVERY-R2: Repair F002-T10 doctor recovery re-entry fixture

## Task ID
`F002-T10-DOCTOR-RECOVERY-R2`

## Task Lineage

- previous_task_id: `F002-T10-DOCTOR-RECOVERY-R1`

## Parent Feature
`002-configuration-model`

## Goal
Fix the caller-local cleanup reference in the existing dirty-worktree test fixture so the doctor recovery re-entry gates can pass and the runtime can restore F002-T10.

## First Executable Step
Edit tests/main.test.ts: in createTempGitWorkspace, replace both Git-setup catch-path calls to workspace.dispose() with the helper's existing rmSync(root, { recursive: true, force: true }) cleanup before rethrowing; preserve the tracked-file dirty-worktree test.

## Minimum Progress Evidence
- The final tests/main.test.ts diff removes every workspace.dispose() reference from createTempGitWorkspace and uses root-scoped rmSync cleanup before throwing in both Git setup failure paths.
- The tracked-file dirty-worktree test remains present, and setup failures in the dirty-worktree tests throw instead of silently skipping.
- npx vitest run tests/main.test.ts and npm run typecheck pass against the final source.

## Trace
- Roadmap objective: Connect the repository-local configuration model to deterministic doctor/runtime orchestration.
- Feature goal: Continue F002-T10's deterministic feature-selection checkpoint in the CLI runtime.
- State gap: The feature is blocked in unblock_pending because F002-T10-DOCTOR-RECOVERY-R1 failed its re-entry quality gates; the recovery fixture still contains an invalid caller-local workspace reference.

## Context
- Feature 002-configuration-model is blocked with active_task F002-T10 and active_unblock_task F002-T10-DOCTOR-RECOVERY-R1. The prior recovery failed npm test during the state-correction-missing-active-task scenario. The advisory recovery lesson identifies an undefined workspace.dispose() reference inside createTempGitWorkspace; the helper performs setup before returning the caller-owned workspace handle, so its catch paths must clean root with the existing rmSync mechanism and rethrow. This task uses only existing files, fields, helpers, and commands; it does not invent a validator or artifact.

## Scope
Allowed:
- `tests/main.test.ts`

Forbidden:
- `src/cli/main.ts`
- `tests/protoBlockerFlows.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/010-add-deterministic-feature-selection-checkpoint-to-the-cli-runtime.md`
- `src/contracts/`
- `all other source files and tests`
- `global tool configuration files`

## Constraints
- Execute as the doctor role with no_review_loop semantics.
- Keep the earlier F002-T10-DOCTOR-RECOVERY-R1 task as historical evidence through previous_task_id.
- Do not rewrite feature or project state; after doctor gates pass, the runtime owns restoration.
- Do not broaden the task beyond tests/main.test.ts or modify src/cli/main.ts.
- Use the existing rmSync cleanup and existing test fixture behavior; do not add a new manifest, validator, or artifact type.
- The fixed restoration target is implementation_running with active_task F002-T10, active_correction_task none, and active_unblock_task none.

## Development Policy
- `test_guided`

## Acceptance Criteria
- Both Git setup failure paths in createTempGitWorkspace clean the temporary root through existing rmSync behavior and rethrow without referencing the caller-local workspace handle.
- The final tests/main.test.ts source contains no undefined workspace reference inside createTempGitWorkspace.
- The tracked-file dirty-worktree coverage and existing dirty-worktree failure behavior remain in the scoped test file.
- All listed doctor re-entry quality-gate commands pass.
- The recovery is executed with doctor and no_review_loop semantics.
- After successful gates, restoration targets lifecycle_state implementation_running, active_task F002-T10, active_correction_task none, and active_unblock_task none.

## Files Likely Affected
- `tests/main.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/010-add-deterministic-feature-selection-checkpoint-to-the-cli-runtime.md`
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

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F002-T10; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-unblock-pending-doctor-recovery-f002-t10-doctor-recovery-r1-failed-its-re-entry
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T10`
- active_correction_task: `none`
- active_unblock_task: `none`
