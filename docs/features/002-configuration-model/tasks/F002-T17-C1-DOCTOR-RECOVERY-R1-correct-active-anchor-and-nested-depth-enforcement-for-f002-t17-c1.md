# Task F002-T17-C1-DOCTOR-RECOVERY-R1: Correct active-anchor and nested-depth enforcement for F002-T17-C1

## Task ID
`F002-T17-C1-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T17-C1`

## Parent Feature
`002-configuration-model`

## Goal
Recover the failed correction task by enforcing the configured correction limit at the existing correct_state/buildStateCorrectionTask boundary using the restoredActiveTask anchor, including nested corrections, with refusal before any artifact or state write.

## First Executable Step
Edit tests/stateCorrectionLimit.test.ts first to add failing executable coverage for base-anchor allocation, nested-anchor refusal at max_review_iterations=1, correct_state write prevention, and the terminal result.

## Minimum Progress Evidence
- tests/stateCorrectionLimit.test.ts contains distinct executable same-anchor and nested-anchor boundary assertions.
- An integration test exercises correct_state and proves refusal occurs before correction markdown/JSON and feature/project state writes.
- The implementation uses the restoredActiveTask anchor and the final changed-file evidence contains only the allowed orchestrator/runtime-helper/test paths.

## Trace
- Roadmap objective: Make CompassRose project-local configuration policy deterministic and bounded at runtime.
- Feature goal: Implement the documented correction-task limit from the configuration model without allowing unbounded recovery loops.
- State gap: Feature 002-configuration-model is quality_failed with active_task F002-T17-C1; the attempt used the feature id instead of the active correction anchor, did not bound nested correction depth, lacked integration/write-prevention/terminal coverage, and changed out-of-scope paths.

## Context
- This is a bounded doctor recovery for the recoverable quality failure on F002-T17-C1. The doctor executor must use no_review_loop semantics. After doctor gates pass, runtime restoration is fixed at lifecycle_state implementation_running with active_task F002-T17-C1, active_correction_task none, and active_unblock_task none.

## Scope
Allowed:
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `tests/`

Forbidden:
- `src/task/taskId.ts`
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/cli/`
- `proto/`
- `all other paths not listed in allowed_paths`

## Constraints
- Execute as doctor with review_policy=no_review_loop; do not open a normal reviewer loop.
- Use the existing limits.max_review_iterations configuration, whose canonical project value is 1; do not add a new field, manifest, validator, or artifact type.
- Use the same restoredActiveTask anchor that is passed to the existing correction-task builder; do not use the feature id as the correction anchor.
- Allow the first correction for an anchor, refuse allocation at the configured boundary, and refuse nested allocation such as F002-T7-C1-C1 when the limit is 1.
- Perform the refusal before correction markdown/JSON creation and before feature or project state mutation.
- On refusal preserve state and return the existing terminal step shape: exitCode 2 and continueLoop false.
- Do not modify the prior task document, feature state, project state, configuration, src/task/taskId.ts, or unrelated source/tests.
- Preserve the fixed restoration target: implementation_running, active_task F002-T17-C1, active_correction_task none, active_unblock_task none.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The correction-limit guard evaluates the candidate for restoredActiveTask at the existing correct_state/buildStateCorrectionTask boundary.
- With max_review_iterations=1, the first correction remains allocatable, a second same-anchor correction is refused, and a nested anchor such as F002-T7-C1 cannot allocate F002-T7-C1-C1.
- A refused correction creates no correction-task markdown or JSON artifact and does not mutate feature or project state.
- The correct_state terminal result is exitCode 2 with continueLoop false when the limit is reached.
- Executable tests cover both allocator behavior and the correct_state integration, including artifact non-creation and state immutability.
- The implementation/test changed-file evidence contains only src/orchestrator/orchestrator.ts, src/orchestrator/runtimeHelpers.ts, and tests/ changes; src/task/taskId.ts and the prior task document remain unchanged.
- All doctor re-entry quality gates pass, after which the runtime can restore implementation_running with active_task F002-T17-C1.

## Files Likely Affected
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `tests/stateCorrectionLimit.test.ts`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/state.md`
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`

## Quality Gates to Run
```bash
npx vitest run tests/stateCorrectionLimit.test.ts
npm run typecheck
npm test
git diff --check
git diff --name-only --exit-code -- src/task/taskId.ts
git diff --name-only --exit-code -- docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md
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
- observed_state: lifecycle=quality_failed; active_task=F002-T17-C1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T17-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
