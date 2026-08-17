# Task 004: Tighten doctor re-entry interface after FX002-T03

## Task ID
`FX002-T04`

## Task Lineage

- previous_task_id: `FX002-T03`

## Parent Feature
`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Goal
Repair the stale doctor-recovery interface exposed by FX002-T03 by preserving its blocker evidence and FX002-T01 anchor, using bounded re-entry gates instead of the known failing full npm test gate, and restoring exactly implementation_running with FX002-T01 active.

## First Executable Step
Get-Content -Raw -LiteralPath 'docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md'

## Minimum Progress Evidence
- A repository diff exists within the allowed recovery-interface paths and records a later doctor recovery linked to FX002-T03.
- The recovery handoff preserves FX002-T01 as the active implementation anchor and does not require the known failing full npm test run before re-entry.
- No source or test implementation change is produced as part of this recovery.

## Trace
- Roadmap objective: Keep CompassRose's deterministic feature-first operation loop recoverable after a bounded blocker.
- Feature goal: Repair the pre-existing DoctorDiagnostics test failure so npm test passes and blocked work can resume.
- State gap: The feature is blocked after FX002-T03 failed its doctor re-entry quality gates; FX002-T01 remains the recorded implementation anchor, but the failed unblock task must be superseded and cleared before implementation resumes.

## Context
- The persisted feature state is blocked with a recoverable task-interface gap. FX002-T03 failed its re-entry quality gates because npm test timed out in tests/taskRequestScopeEnforcement.test.ts. This recovery tightens the existing doctor quality-gate and restoration handoff interface; it does not implement FX002-T01's underlying fix.

## Scope
Allowed:
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`

Forbidden:
- `src/doctor/doctorDiagnostics.ts`
- `tests/**`
- `docs/features/**`
- `package.json`
- `README.md`
- `all other repository paths`

## Constraints
- Execute as doctor with no_review_loop; do not open a normal reviewer loop.
- Preserve blocker kind task_interface_gap and the exact blocker signature task-interface-gap-unblock-pending-doctor-recovery-fx002-t03-failed-its-re-entry-quality-gates-n.
- Preserve FX002-T03 as historical evidence; do not delete or rewrite its failure into a success.
- Use only existing contract mechanisms: quality_gates.before_review, blocker, restoration_target, active_task, active_correction_task, and active_unblock_task.
- Do not add a manifest, validator, or new artifact type.
- Do not fix src/doctor/doctorDiagnostics.ts or tests/taskRequestScopeEnforcement.test.ts; the underlying pre-existing npm test failure remains FX002-T01's implementation responsibility.
- Do not manually choose a lifecycle other than the fixed restoration target; successful doctor gates allow the runtime to restore implementation_running and clear active_unblock_task.
- Do not use the known failing full npm test command as a doctor re-entry gate.
- Use HEAD^ as the explicit pre-recovery ref for the path-scoped no-source/no-test diff gate; never use a ref-less git diff --exit-code gate.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The recovery is a later version of FX002-T03 and sets previous_task_id to FX002-T03 while preserving FX002-T03 as historical evidence.
- The doctor recovery interface explicitly uses no_review_loop semantics and bounded re-entry gates that validate recovery readiness rather than the active fix's unmet full test deliverable.
- The blocker kind, signature, recoverability, observed state, and evidence remain traceable.
- The exact restoration target is lifecycle_state=implementation_running, active_task=FX002-T01, active_correction_task=none, active_unblock_task=none.
- The recovery changes only the allowed state, project, contract, and task-interface paths; no source or test files are modified.
- The doctor gates pass without requiring npm test, allowing the runtime to clear active_unblock_task and resume FX002-T01.

## Files Likely Affected
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/fixes/002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts/tasks/001-repair-the-pre-existing-doctordiagnostics-test-failure.md`
- `tests/taskRequestScopeEnforcement.test.ts`

## Quality Gates to Run
```bash
git diff --check
npm run typecheck
git diff HEAD^ --exit-code -- src/doctor/doctorDiagnostics.ts tests/taskRequestScopeEnforcement.test.ts
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-blocked-fix-002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts-is-bloc
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=FX002-T01; active_correction_task=none; active_unblock_task=none
- evidence: Fix 002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: task_interface_gap
- evidence: - signature: task-interface-gap-unblock-pending-doctor-recovery-fx002-t03-failed-its-re-entry-quality-gates-n
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `FX002-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
