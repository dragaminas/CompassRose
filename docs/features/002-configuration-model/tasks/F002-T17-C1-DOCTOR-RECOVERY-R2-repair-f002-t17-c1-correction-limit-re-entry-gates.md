# Task F002-T17-C1-DOCTOR-RECOVERY-R2: Repair F002-T17-C1 correction-limit re-entry gates

## Task ID
`F002-T17-C1-DOCTOR-RECOVERY-R2`

## Task Lineage

- previous_task_id: `F002-T17-C1-DOCTOR-RECOVERY-R1`

## Parent Feature
`002-configuration-model`

## Goal
Repair the active correction-limit implementation and executable coverage so the doctor re-entry gates pass, then restore the recorded task anchor F002-T17-C1 to implementation_running.

## First Executable Step
Edit tests/stateCorrectionLimit.test.ts first to add failing executable coverage for the restoredActiveTask anchor, nested correction depth at max_review_iterations=1, refusal before artifact/state writes, and the terminal result exitCode 2 with continueLoop false.

## Minimum Progress Evidence
- tests/stateCorrectionLimit.test.ts contains distinct same-anchor and nested-anchor boundary assertions, including F002-T7-C1 refusing F002-T7-C1-C1 at limit 1.
- src/orchestrator/orchestrator.ts checks the same restoredActiveTask anchor later passed to buildStateCorrectionTask before any correction artifact or state writes.
- Executable correct_state coverage verifies refusal creates no correction markdown or JSON artifact and leaves feature/project state unchanged.
- The focused blocker-flow tests pass, including tests/protoBlockerFlows.test.ts.
- The reviewable diff contains only src/orchestrator/orchestrator.ts, src/orchestrator/runtimeHelpers.ts, and tests/ changes.

## Trace
- Roadmap objective: Implement the documented configuration-model limit policy without allowing unbounded correction-task recovery loops.
- Feature goal: Complete F002-TR05 by enforcing a bounded correction-task ID allocation and preserve deterministic runtime recovery for feature 002-configuration-model.
- State gap: Doctor recovery F002-T17-C1-DOCTOR-RECOVERY-R1 failed its re-entry quality gates: npm test reported one failing protoBlockerFlows scenario. The recovery must correct the active correction-limit anchor/depth behavior and prove the refusal path before restoring implementation_running.

## Context
- The feature is blocked in state_corruption after doctor recovery R1 failed its re-entry gate. The latest evidence reports npm test failure in tests/protoBlockerFlows.test.ts at the state-correction-missing-active-task scenario. Prior review lessons identify the bounded recovery interface risks to verify: guarding with the feature id instead of restoredActiveTask, allowing nested correction suffixes beyond the configured limit, lacking integration/write-prevention/terminal assertions, and leaking task-document or src/task/taskId.ts changes. These lessons are advisory and must be checked against the existing implementation and tests.

## Scope
Allowed:
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `tests/`

Forbidden:
- `src/task/taskId.ts`
- `src/cli/main.ts`
- `src/config/`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/`
- `src/contracts/`
- `proto/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `global user or provider configuration files`

## Constraints
- Execute this task as doctor recovery with doctor_recovery.executor_role=doctor and doctor_recovery.review_policy=no_review_loop.
- Preserve blocker signature state-corruption-unblock-pending-doctor-recovery-f002-t17-c1-doctor-recovery-r1-failed-its-re-en and the recorded active task lineage.
- Use the existing restoredActiveTask value as the correction anchor at the existing buildStateCorrectionTask/correct_state boundary; do not substitute the feature id or owner id.
- With max_review_iterations=1, permit the first correction for an anchor but refuse a nested allocation such as F002-T7-C1-C1.
- The refusal check must occur before correction markdown/JSON artifact creation and before feature or project state mutation.
- When the correction limit is reached, preserve the existing terminal result shape: exitCode 2 and continueLoop false.
- Do not modify the failed task document, any state document, src/task/taskId.ts, CLI/configuration behavior, contracts, proto scenarios, or unrelated orchestration behavior.
- Do not invent a manifest, validator, artifact type, or new lifecycle state.
- Use test_guided development for all source/test changes.
- The runtime must restore exactly lifecycle_state=implementation_running, active_task=F002-T17-C1, active_correction_task=none, and active_unblock_task=none after the recovery gates pass.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The correction-limit guard evaluates the exact restoredActiveTask anchor used by the existing correction-task builder.
- Same-anchor allocation remains deterministic below the configured limit and refuses the next allocation at the boundary.
- Nested correction allocation is bounded by the configured max_review_iterations value; F002-T7-C1 cannot allocate F002-T7-C1-C1 when the limit is 1.
- A boundary refusal produces no correction markdown or JSON artifact and does not mutate feature or project state.
- The correct_state step returns exitCode 2 and continueLoop false when the correction limit is reached.
- Focused state-correction and proto blocker-flow tests cover the behavior and pass.
- npm run typecheck, npm test, and git diff --check pass.
- Only src/orchestrator/orchestrator.ts, src/orchestrator/runtimeHelpers.ts, and tests/ have net implementation/test changes; forbidden paths remain unchanged relative to the explicit pre-recovery ref used by the scope gate.
- After successful doctor gates, runtime re-entry can restore the fixed target implementation_running with active_task F002-T17-C1 and no active correction or unblock task.

## Files Likely Affected
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `tests/stateCorrectionLimit.test.ts`
- `tests/protoBlockerFlows.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
npx vitest run tests/stateCorrectionLimit.test.ts tests/protoBlockerFlows.test.ts
npm run typecheck
npm test
git diff --check
git diff HEAD^ --exit-code -- src/task/taskId.ts docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md
```

## Expected Deliverables
- `code`
- `tests`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F002-T17-C1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-unblock-pending-doctor-recovery-f002-t17-c1-doctor-recovery-r1-failed-its-re-en
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T17-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
