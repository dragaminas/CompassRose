# Task 007: Make FX002-T01 reviewable after the bounded scope failure

## Task ID
`FX002-T07`

## Task Lineage

- previous_task_id: `FX002-T06`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Tighten the existing FX002-T01 task and recovery interface so the recorded review failure is an explicit, reviewable no-in-scope-failure outcome, while preserving evidence and restoring the exact runtime task anchor.

## First Executable Step
Update docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md to record the absent DoctorDiagnostics paths, the unreproduced in-scope DoctorCommand failure, and the bounded handoff without creating out-of-scope source or test artifacts.

## Minimum Progress Evidence
- The task document explicitly records blocker signature review-failure-review-pending-the-task-cannot-be-completed-within-its-defined-scope-the-doctordi and the supplied evidence.
- The task document defines the no-in-scope-failure result as a bounded outcome and forbids scope expansion or creation of DoctorDiagnostics artifacts.
- Feature and project state record restoration to lifecycle_state=review_pending with active_task=FX002-T01, active_correction_task=none, and active_unblock_task=none.
- The recovery preserves the non-empty implementation_notes and passed quality-gate evidence instead of rewriting the failed attempt.
- A repository diff exists within the allowed documentation and state paths, and git diff --check passes.

## Trace
- Roadmap objective: Keep deterministic CompassRose execution moving through explicit, bounded recovery when a recoverable review blocker prevents normal completion.
- Feature goal: Resolve the pre-existing npm test failure fix's mis-scoped DoctorDiagnostics task without inventing missing source or test files.
- State gap: The runtime recorded FX002-T01 as review_pending, but review could not establish an in-scope completion because the named DoctorDiagnostics files are absent and no failing in-scope DoctorCommand behavior was reproduced; the recovery must restore the same task anchor with an explicit reviewable outcome.

## Context
- This is a doctor recovery with no_review_loop semantics for blocker kind review_failure, recoverability agent, and the recorded signature review-failure-review-pending-the-task-cannot-be-completed-within-its-defined-scope-the-doctordi. The blocker evidence says the DoctorDiagnostics files are absent, no in-scope DoctorCommand failure was reproduced, quality gates passed, and implementation.implementation_notes is non-empty. The recovery tightens the existing task/re-entry interface and state evidence; it does not attempt the prohibited source-scope expansion.

## Scope
Allowed:
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

Forbidden:
- `src/doctor/doctorDiagnostics.ts`
- `tests/doctor/doctorDiagnostics.test.ts`
- `Any new DoctorDiagnostics source or test artifact`
- `Any DoctorCommand source or test change`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/fix.md`
- `Any repository path outside the explicitly allowed recovery paths`

## Constraints
- Execute as doctor with no_review_loop semantics; the recovery itself must not open a normal reviewer loop.
- Preserve blocker kind review_failure, the exact blocker signature, all supplied evidence, and the prior task lineage.
- Restore exactly lifecycle_state=review_pending, active_task=FX002-T01, active_correction_task=none, and active_unblock_task=none.
- Do not create absent DoctorDiagnostics files, guess at a failure, broaden the DoctorCommand scope, or rewrite the historical task as if it had produced source changes.
- Use only existing task, implementation-notes, diff, quality-gate, feature-state, project-state, and runtime recovery mechanisms; invent no manifest, validator, or artifact type.
- Use documentation_first because the recovery changes only task, contract, project-state, and feature-state documentation.
- The recovery quality gates are the complete doctor re-entry gate set and are not inherited from FX002-T01.
- Any git diff ... --exit-code gate would require an explicit pre-recovery commit reference; this task uses no ref-less diff-exit gate.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- FX002-T07 is recorded as a later recovery version of the prior recovery attempt and preserves FX002-T01 as the restoration task anchor.
- The task handoff explicitly distinguishes the absent/misattributed DoctorDiagnostics scope from an in-scope DoctorCommand failure and records that no in-scope failure was reproduced.
- The handoff permits only the bounded documented outcome and does not ask an implementer or doctor to create DoctorDiagnostics artifacts or expand scope.
- The feature state and project state preserve the blocker evidence and restore the exact required lifecycle and active-task fields.
- The doctor recovery remains documentation/state/interface work, uses no_review_loop semantics, and does not alter feature source or tests.
- All three re-entry quality gates pass, with no reviewer gate inherited from the failed task.

## Files Likely Affected
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

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
- signature: state-corruption-blocked-recoverable-blocker-review-failure-review-pending-the-task-cannot-be-co
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=FX002-T01; active_correction_task=none; active_unblock_task=none
- evidence: Recoverable blocker review-failure-review-pending-the-task-cannot-be-completed-within-its-defined-scope-the-doctordi recorded; running diagnostic/autocorrection before stopping because loop mode is disabled.
- evidence: - kind: review_failure
- evidence: - signature: review-failure-review-pending-the-task-cannot-be-completed-within-its-defined-scope-the-doctordi
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: review_pending
- active_task: `FX002-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
