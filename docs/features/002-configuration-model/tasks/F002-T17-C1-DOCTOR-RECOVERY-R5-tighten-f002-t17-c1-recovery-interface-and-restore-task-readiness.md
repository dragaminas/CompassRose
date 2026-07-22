# Task F002-T17-C1-DOCTOR-RECOVERY-R5: Tighten F002-T17-C1 recovery interface and restore task readiness

## Task ID
`F002-T17-C1-DOCTOR-RECOVERY-R5`

## Task Lineage

- previous_task_id: `F002-T17-C1-DOCTOR-RECOVERY-R4`

## Parent Feature
`002-configuration-model`

## Goal
Revise the recorded F002-T17-C1 task interface in place so the next implementation attempt has a bounded, test-guided contract for active-anchor correction allocation and nested-depth refusal, then restore the recorded task to task_ready.

## First Executable Step
Edit docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md first, preserving task id F002-T17-C1 while making its anchor, nested-limit, write-prevention, scope, and quality-gate requirements explicit.

## Minimum Progress Evidence
- The live diff contains a substantive revision to the existing F002-T17-C1 task document; reading alone is insufficient.
- The revised task document explicitly requires the existing restored active-task anchor, base and nested correction-boundary cases, refusal before state or correction-artifact writes, and concrete test-guided progress evidence.
- After doctor gates pass, feature state is task_ready with active_task F002-T17-C1 and active_correction_task and active_unblock_task both none.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as its project-level runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The feature is implementation_failed with active task F002-T17-C1 because its latest implementation attempt exited successfully but produced no diff, no changed files, and no minimum-progress evidence; the task interface must be tightened before task readiness is restored.

## Context
- The latest F002-T17-C1 attempt is recorded as tool_refusal: changed_files and git_diff are empty, minimum_progress_evidence is absent, exit_code is 0, and no timeout or signal occurred. Feature and project state both require a bounded doctor recovery that preserves the active task anchor. Advisory review lessons identify concrete interface gaps to encode in the existing task contract: use the restored active-task anchor at the state-correction allocation boundary, bound nested correction depth using limits.max_review_iterations, verify refusal before artifact/state writes, and keep the implementation diff scoped. Do not implement source or tests in this recovery.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `src/task/taskId.ts`
- `tests/`
- `src/cli/`
- `src/config/`
- `proto/`
- `src/contracts/`
- `docs/compassrose/CONFIG.md`
- `.git/proto-compassrose/implementation-attempts/`

## Constraints
- Execute this recovery as the doctor role with no_review_loop semantics.
- Revise the existing F002-T17-C1 task document in place; do not create, delete, rename, or replace the historical F002-T17 or F002-T17-C1 task records.
- Keep runtime-managed state restoration separate from the doctor task diff; do not manually rewrite feature or project state.
- Keep the revised implementation task test_guided and require its first action to edit tests before implementation.
- Bind the correction-limit guard to the existing restored active-task anchor at the state-correction allocation boundary, not to the feature owner id.
- Require the configured limits.max_review_iterations boundary to cover both same-anchor allocation and a nested correction anchor, with the first allowed correction remaining allocatable and the next nested correction refused at the limit.
- Require refusal to occur before correction-task artifacts or feature/project state writes, and require deterministic termination rather than continuation when the boundary is reached.
- Keep substantive implementation changes limited to the existing orchestrator/runtime helper and tests scope described by the recovery lessons; any src/task/taskId.ts change must be cleanup-only and return to zero net diff against ref 023507f3.
- Do not invent new manifests, validators, artifact types, provider-specific behavior, or global-tool configuration changes.
- Preserve the blocker signature, no-diff evidence, and R4 recovery lineage.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The existing task document for F002-T17-C1 is revised in place and remains the active task interface; no new normal task id or task artifact is created.
- The revised interface contains executable first-step and minimum-progress requirements that demand failing tests before implementation and observable coverage for same-anchor and nested-anchor correction limits.
- The revised interface names the restored active-task anchor as the allocation anchor and requires the limit check before correction-task artifact creation and feature/project state mutation.
- The revised interface requires the configured max_review_iterations boundary to prevent a nested correction such as a first correction's further correction when the canonical limit is 1, while allowing the first correction.
- The revised interface requires deterministic terminal behavior at the limit and preserves the existing operation-loop recovery semantics without introducing a new contract field or artifact type.
- The doctor recovery changes no source, test, configuration, contract, attempt-history, or runtime-managed state path; only the allowed task-interface path is substantively changed.
- The doctor re-entry gates pass, after which the runtime restores lifecycle_state task_ready with active_task F002-T17-C1 and no active correction or unblock task.

## Files Likely Affected
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `.git/proto-compassrose/implementation-attempts/F002-T17-C1.json`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/planner/doctor-recovery-planning-prompt.md`
- `src/contracts/planner/input.md`
- `src/contracts/planner/output.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check 023507f3
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
