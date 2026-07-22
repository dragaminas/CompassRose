# Task F002-T17-C1-DOCTOR-RECOVERY-R6: Tighten F002-T17-C1 after no-diff implementation failure

## Task ID
`F002-T17-C1-DOCTOR-RECOVERY-R6`

## Task Lineage

- previous_task_id: `F002-T17-C1-DOCTOR-RECOVERY-R5`

## Parent Feature
`002-configuration-model`

## Goal
Repair the tool-refusal blocker by tightening the existing F002-T17-C1 task interface in place, then restore the recorded active task to task_ready for a concrete test-guided implementation retry.

## First Executable Step
Edit docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md in place so its first implementation step begins by adding failing tests for the base-anchor boundary, a distinct nested anchor such as F002-T7-C1 at limit 1, and correct_state write-prevention plus terminal-result behavior.

## Minimum Progress Evidence
- The existing F002-T17-C1 task document has a non-empty doctor-attributable diff and remains the same task id; no replacement task document is created.
- The revised task interface explicitly requires executable tests for restoredActiveTask anchoring, nested correction-depth refusal, refusal before markdown/JSON/state writes, and exitCode 2 with continueLoop false.
- The revised task interface pins substantive implementation/test paths to src/orchestrator/orchestrator.ts, src/orchestrator/runtimeHelpers.ts, and tests/stateCorrectionLimit.test.ts, with only cleanup-only handling of src/task/taskId.ts.
- The revised task interface records runnable focused, typecheck, full-test, whitespace, and explicit-baseline scope gates so the next implementation attempt must produce repository progress rather than only transcript output.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as its project-level runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: Feature 002-configuration-model is in implementation_failed with active_task F002-T17-C1; the latest attempt exited successfully but produced no git diff and no minimum-progress evidence, classified as tool_refusal.

## Context
- This is a doctor recovery with executor_role=doctor and review_policy=no_review_loop. The latest F002-T17-C1 attempt contains implementation notes and passing focused-test output but changed no files. The recovery must tighten the existing task handoff only, preserve the failed attempt as history, and restore the fixed task_ready anchor so normal execution can retry the recorded task.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md`
- `all other files under docs/features/002-configuration-model/tasks/`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `src/task/taskId.ts`
- `tests/stateCorrectionLimit.test.ts`
- `all other source, test, configuration, project-state, proto, and global-tool configuration paths`

## Constraints
- Execute this recovery as doctor with no_review_loop semantics; do not open a normal reviewer loop or create another recovery task.
- Preserve blocker kind implementation_failure, signature implementation-failure-F002-T17-C1, recoverability agent, and the evidence that the attempt produced no git diff because of tool_refusal.
- Restore exactly lifecycle_state=task_ready, active_task=F002-T17-C1, active_correction_task=none, and active_unblock_task=none; do not restore implementation_failed or choose a different anchor.
- Edit the existing F002-T17-C1 task document in place. Do not delete, rename, replace, or rewrite historical F002-T17-C1 or F002-T17 artifacts, and do not create a new normal implementation task.
- Use only existing task-contract fields and mechanisms. Do not add a fictional manifest, validator, artifact type, or reviewable-diff field.
- The revised active task must remain test_guided and must require a live repository diff and minimum-progress evidence before completion.
- The revised active task must use restoredActiveTask as the correction-limit anchor at the existing correct_state/buildStateCorrectionTask boundary, must bound nested suffix depth, and must refuse before correction markdown/JSON artifacts and feature/project state writes.
- The revised active task must include explicit baseline ref 023507f3 before every git diff ... --exit-code pathspec comparison, including the task-document and src/task/taskId.ts zero-net-diff checks.
- The doctor recovery itself must not modify source, tests, feature state, project state, or the parent F002-T17 task document.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- Only the existing F002-T17-C1 task document is changed by the doctor recovery; no source, test, state, project-state, parent-task, or new-task path is changed.
- The task document explicitly identifies executor_role=doctor and review_policy=no_review_loop for this recovery context while retaining F002-T17-C1 as the implementation anchor.
- The task document's first executable step starts with a write to tests/stateCorrectionLimit.test.ts and covers base-anchor C1/C2/C3 allocation, a distinct nested anchor such as F002-T7-C1 refusing F002-T7-C1-C1 at limit 1, and correct_state terminal/write-prevention behavior.
- The task document requires executable evidence that the limit guard uses restoredActiveTask rather than the feature owner id, runs before writeStateCorrectionTask, artifact JSON writes, and feature/project state updates, and returns exitCode 2 with continueLoop false at the boundary.
- The task document restricts substantive implementation changes to src/orchestrator/orchestrator.ts, src/orchestrator/runtimeHelpers.ts, and tests/stateCorrectionLimit.test.ts; any src/task/taskId.ts change is cleanup-only and must reach zero net diff against 023507f3.
- The task document requires explicit scope gates `git diff --name-only --exit-code 023507f3 -- src/task/taskId.ts` and `git diff --name-only --exit-code 023507f3 -- docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md`, alongside the focused test, typecheck, full test, and git diff --check gates.
- After the doctor gates pass, deterministic runtime re-entry can restore the fixed target task_ready with active_task F002-T17-C1 and no active correction or unblock task.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `.git/proto-compassrose/implementation-attempts/F002-T17-C1.json`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `src/task/taskId.ts`
- `tests/stateCorrectionLimit.test.ts`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/compassrose/CONFIG.md`

## Quality Gates to Run
```bash
git diff --check
npm run typecheck
npm test
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-implementation-failed-feature-002-configuration-model-is-in-implementation-fail
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=F002-T17-C1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: implementation_failure
- evidence: - signature: implementation-failure-F002-T17-C1
- evidence: - recoverability: agent
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T17-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
