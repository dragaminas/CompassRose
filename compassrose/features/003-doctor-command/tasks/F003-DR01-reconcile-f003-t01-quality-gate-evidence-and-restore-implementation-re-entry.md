# Task F003-DR01: Reconcile F003-T01 quality-gate evidence and restore implementation re-entry

## Task ID
`F003-DR01`

## Task Lineage

- previous_task_id: `F003-T01`

## Parent Feature
`003-doctor-command`

## Goal
Preserve the supplied quality-gate blocker evidence, reconcile the feature and project state documents, and make the fixed restoration target implementation_running with F003-T01 explicit without changing the implementation attempt.

## First Executable Step
Run `npm test` and capture its result before editing the two allowed state documents.

## Minimum Progress Evidence
- The available test result and the absence of persisted raw failed-gate output, if applicable, are recorded in existing state/history narrative.
- Feature state records lifecycle_state implementation_running with F003-T01 active and no correction or unblock task.
- Project state consistently identifies feature 003-doctor-command and F003-T01 as the active restoration target while retaining completed-fix and quality-failure history.
- Only the two allowed state documents are edited.

## Trace
- Roadmap objective: Advance the active feature through CompassRose's deterministic implementation and quality-gate loop.
- Feature goal: Provide a read-only compassrose doctor command that reports whether repository-local prerequisites are satisfied.
- State gap: Feature state records quality_failed with F003-T01 active, while project state says the completed fix restored the feature but still retains a quality-gate investigation and stop hint; concrete failed-gate output is absent.

## Context
- The current worktree contains the F003-T01 implementation attempt and state-document edits. The latest diagnostic identifies an environment recovery-interface gap, not a demonstrated implementation or architecture failure. Reconcile only the feature and project state documents, preserve the implementation artifacts, and do not promote the advisory protoBlockerFlows refinement to confirmed evidence.

## Scope
Allowed:
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/**`
- `tests/**`
- `docs/features/003-doctor-command/feature.md`
- `docs/features/003-doctor-command/architecture.md`
- `docs/features/003-doctor-command/request.md`
- `docs/compassrose/CONFIG.md`
- `docs/fixes/**`
- `.git/**`
- `all other repository paths`

## Constraints
- Execute as doctor with no_review_loop semantics.
- Preserve blocker signature environment-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagnosis-a and all supplied evidence.
- Record the exact evidence available from the orchestrator; if raw failed-gate output is unavailable, state that explicitly rather than inventing details.
- Treat the protoBlockerFlows.test.ts refinement as advisory and unverified; do not record it as confirmed failure evidence.
- Preserve F003-T01 as the active task anchor and do not replace or delete its history.
- Use the fixed restoration target lifecycle_state implementation_running, active_task F003-T01, active_correction_task none, and active_unblock_task none.
- Do not modify source, tests, feature definitions, configuration, fix documents, or Git metadata.
- Use 03047efd as the explicit pre-recovery Git reference for forbidden-path diff checks; do not use a ref-less git diff --exit-code gate.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The feature state conforms to the feature-state contract with lifecycle_state implementation_running, active_task F003-T01, active_correction_task none, and active_unblock_task none.
- The feature state preserves the failed quality-gate result as historical evidence and explicitly records that no concrete failed-gate output or implementation-failure evidence is available.
- PROJECT_STATE.md no longer contradicts itself by saying no feature is active while also identifying 003-doctor-command as active, and its current reality, pending work, and next planning hint agree with the implementation_running/F003-T01 restoration target.
- The completed fix records and prior blocker history remain preserved; no history is deleted or rewritten as if the quality gate had passed.
- The recovery task remains limited to the two allowed state documents and does not alter source, tests, feature definitions, configuration, fix documents, or Git metadata.
- All listed recovery gates pass, after which deterministic runtime re-entry resumes the fixed restoration target without a reviewer loop.

## Files Likely Affected
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/compassrose/CONFIG.md`
- `src/doctor/doctorDiagnostics.ts`
- `tests/doctor/`

## Quality Gates to Run
```bash
npm test
git diff --check
git grep -F -q "implementation_running" -- docs/features/003-doctor-command/state.md
git grep -F -q "active_task: F003-T01" -- docs/features/003-doctor-command/state.md
git grep -F -q "active_correction_task: none" -- docs/features/003-doctor-command/state.md
git grep -F -q "active_unblock_task: none" -- docs/features/003-doctor-command/state.md
git grep -F -q "No concrete failed-gate output" -- docs/features/003-doctor-command/state.md
git grep -F -q "F003-T01" -- docs/compassrose/PROJECT_STATE.md
git grep -F -q "implementation_running" -- docs/compassrose/PROJECT_STATE.md
git diff 03047efd --exit-code -- src/ tests/ docs/features/003-doctor-command/feature.md docs/features/003-doctor-command/architecture.md docs/compassrose/CONFIG.md
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-quality-failed-plan-one-bounded-doctor-recovery-task-to-preserve-the-blocker-ev
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F003-T01; active_correction_task=none; active_unblock_task=none
- evidence: Plan one bounded doctor recovery task to preserve the blocker evidence, reconcile the stale feature/project state and restoration target, and establish executable re-entry gates for F003-T01. The available evidence does not justify filing a systemic blocker.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F003-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
