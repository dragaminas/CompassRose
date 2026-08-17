# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R2: Supersede failed re-entry handoff with a contract-conforming recovery

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R2`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R1`

## Parent Feature
`002-configuration-model`

## Goal
Create a bounded later-version doctor recovery that preserves the failed recovery as history, removes unsupported handoff assumptions, and restores the exact recorded implementation task anchor after its re-entry gate passes.

## First Executable Step
Read the failed R1 recovery task artifact at docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R1.md and compare its recovery fields and gates with the supplied doctor-recovery and operation-loop contracts.

## Minimum Progress Evidence
- A persisted R2 recovery artifact links to R1 through previous_task_id and preserves the exact blocker signature and restoration target.
- The recovery interface contains only contract-supported fields and commands; it does not require an invented manifest, validator, quality-gates.json record, or unsupported attempt-artifact type.
- The doctor re-entry gate git diff --check exits successfully, and runtime state is restored to implementation_running with the exact active task and no active correction or unblock task.

## Trace
- Roadmap objective: Connect configuration validation to the doctor/runtime flow and update state based on approved behavior.
- Feature goal: Resume the configuration-model implementation handoff using the repository-local configuration and deterministic runtime contracts.
- State gap: The feature remains unblock_pending after doctor recovery R1 failed its re-entry gates, although the runtime must resume the recorded repair-handoff task in implementation_running.

## Context
- The blocker is a failed doctor recovery handoff, not a feature-design gap. The supplied contracts already define doctor recovery, runtime re-entry, state restoration, and runnable gates; the advisory lesson's unsupported manifest and validator proposals must not be introduced.

## Scope
Allowed:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R1.md`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R2.md`

Forbidden:
- `src/**`
- `tests/**`
- `implementation.json`
- `quality-gates.json`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`

## Constraints
- Execute as doctor with no_review_loop semantics.
- Preserve R1 as historical evidence; do not delete or rewrite it.
- Use the fixed restoration target: lifecycle_state=implementation_running; active_task=F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF; active_correction_task=none; active_unblock_task=none.
- Keep the recovery limited to task/state handoff bookkeeping; do not modify source or tests.
- Treat the doctor-recovery-task and operation-loop contracts as read-only references; do not broaden or redesign them.
- Do not introduce implementation_context_paths, preserved-artifact manifests, quality-gates.json, custom validators, or other mechanisms absent from the supplied contracts.
- Do not manually claim implementation acceptance; runtime restores the target only after the doctor gate passes.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The R2 task is a later-version recovery linked to R1 and retains the exact blocker signature, observed unblock_pending state, and restoration target.
- The recovery artifact is narrowly scoped to the failed re-entry handoff and uses only existing contract fields and directly executable gates.
- No source, test, feature-architecture, configuration, or runtime-contract files are changed.
- The doctor gate passes, after which runtime restores the exact implementation_running anchor and clears active_unblock_task and active_correction_task.
- The normal configured typecheck and test gates remain available for the restored active implementation task rather than being replaced by unsupported recovery metadata.

## Files Likely Affected
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-DOCTOR-RECOVERY-R1.md`

## Quality Gates to Run
```bash
git diff --check
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
- observed_state: lifecycle=blocked; active_task=F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-unblock-pending-doctor-recovery-f002-t05-c1-correction-handoff-c1-correction-r1
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF`
- active_correction_task: `none`
- active_unblock_task: `none`
