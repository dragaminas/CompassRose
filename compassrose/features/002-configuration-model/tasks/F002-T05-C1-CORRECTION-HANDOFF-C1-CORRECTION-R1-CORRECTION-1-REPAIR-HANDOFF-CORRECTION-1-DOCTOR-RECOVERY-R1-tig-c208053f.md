# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1-DOCTOR-RECOVERY-R1: Tighten repair-handoff Implementation Notes requirement

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1`

## Parent Feature
`002-configuration-model`

## Goal
Make the recorded repair-handoff task explicitly require a non-empty Implementation Notes justification in its implementation handoff, then restore that unchanged task anchor to task_ready through doctor re-entry.

## First Executable Step
Edit docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1-repair-structured-hand-1df4bfcc.md to add one explicit acceptance criterion requiring a non-empty Implementation Notes justification, without changing its feature scope or deliverables.

## Minimum Progress Evidence
- The recorded repair-handoff task document has a non-empty diff containing the explicit Implementation Notes requirement.
- The changed-path report for the allowed task document contains no other recovery-owned path.
- The task document does not introduce a structured implementation_context_paths requirement or any new artifact type.

## Trace
- Roadmap objective: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- Feature goal: Connect configuration validation to the broader runtime flow and prove the documented configuration model through approved implementation tasks and quality gates.
- State gap: The feature is implementation_failed because the active repair-handoff attempt omitted the required Implementation Notes justification; the recorded active task must be made retry-ready and restored to task_ready.

## Context
- This is a bounded doctor-only task-interface repair. The supplied implementation attempt is failed with no changed files, an empty git diff, absent minimum-progress evidence, and a null implementation_notes value. Modify only the recorded task definition so the next retry has an explicit existing handoff requirement; the runtime owns restoration of the state document to task_ready after doctor gates pass.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1-repair-structured-hand-1df4bfcc.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `.git/proto-compassrose/implementation-attempts/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1.json`
- `implementation.json`
- `quality-gates.json`
- `src/`
- `tests/`

## Constraints
- doctor recovery executor only
- no_review_loop; do not invoke or create a normal reviewer loop
- Preserve the failed task as historical evidence through previous_task_id.
- Do not modify feature state or project state; the runtime restores lifecycle_state to task_ready and clears active_correction_task and active_unblock_task after re-entry gates pass.
- Do not create or modify quality-gate evidence, implementation-attempt artifacts, source files, tests, or unrelated documentation.
- Do not add unsupported structured context-path fields, manifests, validators, or artifact types.
- Keep the active task identifier unchanged.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The recorded repair-handoff task explicitly requires a non-empty Implementation Notes justification in the implementation handoff.
- Only the explicitly allowed repair-handoff task document is changed by doctor recovery.
- The active task identifier and its feature scope remain unchanged.
- No unsupported implementation_context_paths field, new artifact type, quality-gate evidence file, source change, or test change is introduced.
- After these doctor re-entry gates pass, the runtime can restore lifecycle_state to task_ready with active_task set to F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1 and both recovery task pointers set to none.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1-repair-structured-hand-1df4bfcc.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `.git/proto-compassrose/implementation-attempts/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1.json`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check -- docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1-repair-structured-hand-1df4bfcc.md
git grep -n -F "Implementation Notes" -- docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1-repair-structured-hand-1df4bfcc.md
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
- observed_state: lifecycle=implementation_failed; active_task=F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: implementation_failure
- evidence: - signature: implementation-failure-F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1
- evidence: - recoverability: agent
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1`
- active_correction_task: `none`
- active_unblock_task: `none`
