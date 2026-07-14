# Task F002-T10-DOCTOR-RECOVERY-R1: Repair F002-T10 test-fixture cleanup for doctor re-entry

## Task ID
`F002-T10-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T10`

## Parent Feature
`002-configuration-model`

## Goal
Remove the reported test-fixture setup defect in tests/main.test.ts so F002-T10 can pass its quality gates and resume from implementation_running.

## First Executable Step
Edit tests/main.test.ts: replace the two pre-return workspace.dispose() calls in createTempGitWorkspace's git-init and git-commit failure paths with the helper's existing root-scoped cleanup, then rethrow the setup error.

## Minimum Progress Evidence
- The final tests/main.test.ts diff contains no caller-local workspace reference inside createTempGitWorkspace's setup failure paths and preserves cleanup before rethrowing.
- npx vitest run tests/main.test.ts passes after the final edit.
- npm run typecheck passes against the final tests/main.test.ts source.
- npm test passes after the final edit.

## Trace
- Roadmap objective: Complete the project-local configuration model by connecting configuration validation to the deterministic runtime flow.
- Feature goal: Advance feature 002-configuration-model through the recorded F002-T10 runtime checkpoint without changing its configuration scope.
- State gap: The valid feature state is quality_failed with active task F002-T10; the supplied advisory lesson identifies a test-fixture setup defect that must be corrected before deterministic execution can resume.

## Context
- Feature 002-configuration-model is recorded in quality_failed with active_task F002-T10 and no active correction or unblock task. This recovery is implementation/test recovery, not pure state correction. The supplied review lesson is advisory and unverified; the doctor must verify the reported undefined workspace.dispose() references in createTempGitWorkspace against the final diff and typecheck. Runtime state documents remain runtime-owned and are restored only after doctor quality gates pass.

## Scope
Allowed:
- `tests/main.test.ts`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/010-add-deterministic-feature-selection-checkpoint-to-the-cli-runtime.md`
- `src/**`
- `tests/** except tests/main.test.ts`
- `all other repository files`

## Constraints
- doctor executes this task with review_policy no_review_loop.
- Preserve blocker signature, evidence, and F002-T10 lineage; do not create a replacement normal task.
- Do not broaden the recovery into CLI, configuration, runtime, or architecture changes.
- Do not modify feature or project state; the runtime owns restoration to the fixed target after doctor gates pass.
- Retain existing dirty-worktree coverage and do not silently skip fixture setup failures.
- Do not invent manifests, validators, or new artifact types.

## Development Policy
- `test_guided`

## Acceptance Criteria
- Both Git setup failure paths in createTempGitWorkspace clean the temporary root using helper-scope data before throwing and do not reference the caller-local workspace handle.
- The existing tracked-file and untracked-file dirty-worktree tests remain present, assert exit code 1, and retain runtime preflight and git_policy diagnostics coverage.
- The final change is limited to tests/main.test.ts and passes all listed doctor re-entry gates.
- After the gates pass, the runtime can restore lifecycle_state implementation_running with active_task F002-T10 and no active correction or unblock task.

## Files Likely Affected
- `tests/main.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/010-add-deterministic-feature-selection-checkpoint-to-the-cli-runtime.md`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check -- tests/main.test.ts
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
- observed_state: lifecycle=quality_failed; active_task=F002-T10; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T10`
- active_correction_task: `none`
- active_unblock_task: `none`
