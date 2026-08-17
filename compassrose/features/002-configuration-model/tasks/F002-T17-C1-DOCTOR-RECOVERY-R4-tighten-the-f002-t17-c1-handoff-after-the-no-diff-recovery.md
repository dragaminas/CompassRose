# Task F002-T17-C1-DOCTOR-RECOVERY-R4: Tighten the F002-T17-C1 handoff after the no-diff recovery

## Task ID
`F002-T17-C1-DOCTOR-RECOVERY-R4`

## Task Lineage

- previous_task_id: `F002-T17-C1-DOCTOR-RECOVERY-R3`

## Parent Feature
`002-configuration-model`

## Goal
Repair the stale active-task handoff that allowed F002-T17-C1-DOCTOR-RECOVERY-R3 to produce no git diff by making the recorded correction task's first implementation step concrete and cleanup-focused. Execute as doctor with no_review_loop, then restore the fixed F002-T17-C1 implementation checkpoint.

## First Executable Step
Edit only the First Executable Step line in docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md so it reads: "Remove the attempt-only limitStateCorrectionTaskId helper from src/task/taskId.ts, then run npx vitest run tests/stateCorrectionLimit.test.ts."

## Minimum Progress Evidence
- The active F002-T17-C1 task document contains the exact cleanup-first executable step and differs from the pre-recovery commit.
- The live changed-file evidence contains only docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md; no source, test, contract, state, project-state, or historical recovery task path changes are introduced.
- The historical F002-T17-C1-DOCTOR-RECOVERY-R3 task and its no-diff evidence remain unchanged.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as its project-level runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: Feature 002-configuration-model is blocked after F002-T17-C1-DOCTOR-RECOVERY-R3 produced no git diff. The persisted recovery checkpoint must be repaired without changing the recorded active task F002-T17-C1 or its fixed implementation_running restoration target.

## Context
- The feature state records lifecycle=blocked, active_task=F002-T17-C1, no active correction task, and a blocker signature for the failed R3 recovery. The latest diagnostic records R3 as an unblock_pending recovery that produced no git diff with context_overflow. The active correction task document is the narrow interface boundary that can be tightened; the doctor must preserve all prior evidence and make only one concrete handoff edit before deterministic re-entry.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/F002-T17-C1-DOCTOR-RECOVERY-R3-repair-the-windows-portable-re-entry-gate-for-f002-t17-c1.md`
- `docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md`
- `docs/features/002-configuration-model/tasks/*.md except the explicitly allowed active task document`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `src/task/taskId.ts`
- `tests/`
- `src/contracts/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `all global or provider-specific external-tool configuration paths`

## Constraints
- This is exactly one doctor recovery task with doctor_recovery.executor_role=doctor and doctor_recovery.review_policy=no_review_loop; do not enter the normal reviewer loop.
- Preserve blocker kind state_corruption, signature state-corruption-unblock-pending-implementation-for-f002-t17-c1-doctor-recovery-r3-produced-no-g, recoverability agent, and the recorded R3 no-diff/context_overflow evidence.
- Set previous_task_id to F002-T17-C1-DOCTOR-RECOVERY-R3 and preserve R3 as historical evidence; do not edit, delete, rename, or supersede the R3 artifact in place.
- Change only the active F002-T17-C1 task document's First Executable Step line. Do not change task identity, parent task, scope, acceptance criteria, quality gates, restoration target, feature state, project state, source, or tests.
- Do not repeat R3's unsatisfiable no-diff handoff or invent a runtime smoke command, manifest, validator, artifact type, or lifecycle state.
- Use documentation_first because this recovery changes only the existing task interface document.
- The configured max_recovery_iterations is 3; this is the bounded next recovery after the recorded two completed recovery attempts. If this recovery fails, stop with the blocker rather than generating another recovery task.
- After doctor gates pass, restore exactly lifecycle_state=implementation_running, active_task=F002-T17-C1, active_correction_task=none, and active_unblock_task=none.
- The restoration target is forward progress and must not be changed to blocked or unblock_pending.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The active F002-T17-C1 task document contains the exact cleanup-first First Executable Step specified by this recovery.
- The only doctor-produced implementation diff is the allowed active task-document edit; no source, tests, contracts, state documents, project state, or historical task artifacts are changed.
- The blocker signature and R3 no-diff evidence remain traceable, and the recovery is explicitly doctor-only with no_review_loop semantics.
- All re-entry quality gates pass against explicit pre-recovery ref 366cb5f8; no ref-less git diff --exit-code gate is used.
- After successful doctor re-entry, the runtime restores exactly implementation_running with active_task F002-T17-C1 and no active correction or unblock task.

## Files Likely Affected
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `docs/features/002-configuration-model/tasks/F002-T17-C1-DOCTOR-RECOVERY-R3-repair-the-windows-portable-re-entry-gate-for-f002-t17-c1.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/compassrose/CONFIG.md`

## Quality Gates to Run
```bash
node -e "const fs=require('fs'),p='docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md'; if(!fs.readFileSync(p,'utf8').includes('Remove the attempt-only limitStateCorrectionTaskId helper from src/task/taskId.ts, then run npx vitest run tests/stateCorrectionLimit.test.ts.')) process.exit(1)"
git diff --check
git diff --name-only --exit-code 366cb5f8 -- src/orchestrator/orchestrator.ts src/orchestrator/runtimeHelpers.ts src/task/taskId.ts tests/ src/contracts/ docs/compassrose/CONFIG.md docs/features/002-configuration-model/feature.md docs/features/002-configuration-model/architecture.md docs/features/002-configuration-model/tasks/F002-T17-C1-DOCTOR-RECOVERY-R3-repair-the-windows-portable-re-entry-gate-for-f002-t17-c1.md docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md
```

## Expected Deliverables
- `documentation`

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
- evidence: - signature: state-corruption-unblock-pending-implementation-for-f002-t17-c1-doctor-recovery-r3-produced-no-g
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T17-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
