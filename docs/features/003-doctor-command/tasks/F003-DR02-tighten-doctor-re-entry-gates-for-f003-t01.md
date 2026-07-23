# Task F003-DR02: Tighten doctor re-entry gates for F003-T01

## Task ID
`F003-DR02`

## Task Lineage

- previous_task_id: `F003-DR01`

## Parent Feature
`003-doctor-command`

## Goal
Create a bounded doctor recovery handoff that preserves F003-DR01 as history, removes the failed broad re-entry gate from the recovery interface, and restores deterministic execution at F003-T01.

## First Executable Step
Edit docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md to separate doctor re-entry gates from F003-T01 implementation gates and define only the recovery-specific gate `git diff --check`.

## Minimum Progress Evidence
- A non-empty diff updates the active task interface with a bounded doctor-only re-entry gate set.
- The recovery handoff preserves previous_task_id F003-DR01, the supplied blocker signature, and the fixed restoration target.
- No source, test, generic contract, or runtime-loop files are changed.

## Trace
- Roadmap objective: Make repository readiness observable before workflow execution.
- Feature goal: Provide a read-only compassrose doctor command with deterministic diagnostics and a clear readiness result.
- State gap: The feature is blocked after F003-DR01 failed its re-entry quality gates; the recovery interface must be tightened before restoring implementation_running with F003-T01 active.

## Context
- F003-DR01 failed its doctor re-entry quality gates, including the recorded npm test failure in tests/protoBlockerFlows.test.ts. The existing doctor-recovery and runtime contracts already define recovery-only gates and runtime-owned restoration, so this task updates only the active task interface.

## Scope
Allowed:
- `docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`

Forbidden:
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/compassrose/CONFIG.md`
- `src/doctor/`
- `src/cli/`
- `tests/`

## Constraints
- Execute as doctor with no_review_loop semantics.
- Preserve blocker kind state_corruption, signature, evidence, recoverability, and observed state.
- Do not rewrite or delete F003-DR01; link it through previous_task_id.
- Do not manually rewrite feature or project lifecycle state; the runtime owns restoration after recovery gates pass.
- Do not modify source, tests, generic contracts, runtime orchestration, or Doctor feature behavior.
- Do not inherit the active implementation task's full npm test gate for doctor re-entry.
- Use only contract-defined task fields and mechanisms; do not introduce manifests, validators, or new artifact types.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The recovery interface is a later version of F003-DR01 and records previous_task_id as F003-DR01.
- The doctor recovery handoff uses executor_role doctor and review_policy no_review_loop.
- The failed broad npm test gate is not required for doctor re-entry; the recovery gate list contains only the bounded literal command git diff --check.
- The restoration target is exactly lifecycle_state implementation_running, active_task F003-T01, active_correction_task none, active_unblock_task none.
- The supplied blocker signature and evidence remain preserved.
- Only the explicitly allowed task-interface document is changed.

## Files Likely Affected
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`

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
- signature: state-corruption-blocked-feature-003-doctor-command-is-blocked-and-needs-diagnosis-autocorrectio
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F003-T01; active_correction_task=none; active_unblock_task=none
- evidence: Feature 003-doctor-command is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-implementation-running-doctor-recovery-f003-dr01-failed-its-re-entry-quality-ga
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F003-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
