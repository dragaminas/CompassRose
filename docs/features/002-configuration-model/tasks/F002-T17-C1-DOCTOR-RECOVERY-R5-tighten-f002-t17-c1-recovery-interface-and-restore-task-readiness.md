# Task F002-T17-C1-DOCTOR-RECOVERY-R5: Tighten F002-T17-C1 recovery interface and restore task readiness

## Task ID
`F002-T17-C1-DOCTOR-RECOVERY-R5`

## Task Lineage

- previous_task_id: `F002-T17-C1-DOCTOR-RECOVERY-R4`

## Parent Feature
`002-configuration-model`

## Goal
Revise the existing F002-T17-C1 task interface in place so the failed no-diff context-overflow attempt can be retried through a bounded, explicit correction-anchor and nested-depth implementation scope.

## First Executable Step
Edit docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md in place to make its first action a focused edit of tests/stateCorrectionLimit.test.ts and to pin the exact anchor, nested-depth, terminal-refusal, and changed-path requirements.

## Minimum Progress Evidence
- The existing F002-T17-C1 task document has a non-empty diff against pre-recovery ref c1079422.
- Its first executable step explicitly starts with focused test edits rather than repository-wide exploration.
- Its scope names only src/orchestrator/orchestrator.ts, src/orchestrator/runtimeHelpers.ts, and tests/stateCorrectionLimit.test.ts as implementation paths, and explicitly forbids src/task/taskId.ts, task/state documents, CLI, config, proto, and unrelated paths.
- Its acceptance criteria require restoredActiveTask anchoring, nested -C depth enforcement, correct_state artifact/state immutability, and the existing terminal result shape.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as the project-level runtime policy.
- Feature goal: Define a repository-local configuration model covering policy limits and validation behavior used by the runtime.
- State gap: Feature 002-configuration-model is in implementation_failed with active_task F002-T17-C1; the latest attempt exited successfully but produced no git diff or minimum progress evidence and was classified as context_overflow.

## Context
- The prior F002-T17-C1 recovery attempt produced no repository progress. The narrowest recoverable action is to tighten the existing task interface in place, preserve its active anchor, and make the next implementation retry start with focused executable evidence. Runtime-owned feature and project state restoration remains outside the reviewable task diff.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `tests/`
- `src/task/taskId.ts`
- `src/cli/`
- `src/config/`
- `proto/`
- `.git/`

## Constraints
- This is doctor recovery R5 for the recorded active task F002-T17-C1; preserve that task id and do not create a replacement normal task.
- Execute as doctor with no_review_loop semantics.
- Modify the existing 017.1 task document in place; do not create, rename, delete, or record another task document.
- The revised active-task interface must require the existing correct_state path to use restoredActiveTask at the allocation boundary before markdown, JSON, feature-state, or project-state writes.
- The revised interface must require nested correction suffixes to count toward the configured limits.max_review_iterations boundary, including refusal of F002-T7-C1-C1 when the limit is 1.
- The revised interface must require executable correct_state coverage for no artifact writes, unchanged feature/project state, exitCode 2, and continueLoop false when allocation is refused.
- The revised active-task scope must exclude src/task/taskId.ts and all unrelated CLI, config, proto, task-document, feature-state, and project-state changes.
- Do not alter runtime state documents in the recovery diff; the runtime applies the fixed restoration target after doctor gates pass.
- Use pre-recovery ref c1079422 for all scope-diff comparisons; never use a ref-less git diff --exit-code gate.
- Do not introduce a new manifest, validator, artifact type, or runtime mechanism.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- Exactly one doctor recovery task is generated for the implementation-failure signature implementation-failure-F002-T17-C1.
- The existing F002-T17-C1 task interface is tightened in place and remains the recorded active task anchor.
- The revised task interface is bounded to the existing correction allocation path and focused regression test file, with no source implementation or state-document changes performed by this recovery.
- The revised first step directs the implementer to begin with executable tests covering same-anchor allocation, a distinct nested anchor, configured-limit refusal, and correct_state terminal behavior.
- The revised acceptance criteria require the guard to use restoredActiveTask rather than the feature owner id, before existing artifact/state writes.
- The revised acceptance criteria require nested -C suffix depth enforcement and refusal at the configured max_review_iterations boundary.
- The revised acceptance criteria require refusal to produce no correction markdown or JSON artifact, leave feature and project state unchanged, and return exitCode 2 with continueLoop false.
- The revised task interface explicitly forbids the prior out-of-scope src/task/taskId.ts and task-document changes.
- All doctor re-entry quality gates pass, including the explicit-ref forbidden-source diff gate.
- After the doctor gates pass, the runtime restores lifecycle_state=task_ready, active_task=F002-T17-C1, active_correction_task=none, and active_unblock_task=none.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `tests/stateCorrectionLimit.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/task/doctor-recovery-task.md`
- `.git/proto-compassrose/implementation-attempts/F002-T17-C1.json`

## Quality Gates to Run
```bash
git diff --check
npm run typecheck
npm test
git diff c1079422 --exit-code -- src/orchestrator/orchestrator.ts src/orchestrator/runtimeHelpers.ts tests src/task/taskId.ts src/cli src/config proto
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
