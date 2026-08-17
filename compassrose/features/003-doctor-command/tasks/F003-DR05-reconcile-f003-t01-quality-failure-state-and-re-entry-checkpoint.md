# Task F003-DR05: Reconcile F003-T01 quality-failure state and re-entry checkpoint

## Task ID
`F003-DR05`

## Task Lineage

- previous_task_id: `F003-DR04`

## Parent Feature
`003-doctor-command`

## Goal
Preserve the confirmed quality-gate blocker and reconcile feature/project state so the runtime can restore F003-T01 to implementation_running.

## First Executable Step
Read the blocker, lifecycle, operational-status, and recovery sections of docs/features/003-doctor-command/state.md and docs/compassrose/PROJECT_STATE.md against the supplied restoration target.

## Minimum Progress Evidence
- A non-empty scoped diff updates the feature or project recovery state; reading and command output alone are insufficient.
- The supplied blocker signature and confirmed quality-gate evidence remain recorded as historical evidence.
- After recovery gates pass, the feature and project anchor is implementation_running with F003-T01 active and no active correction or unblock task.

## Trace
- Roadmap objective: Continue the active feature after an agent-recoverable quality-gate state corruption.
- Feature goal: Resume the feature-owned read-only Doctor implementation at F003-T01.
- State gap: The feature is quality_failed after F003-T01 quality-gate failure, while deterministic re-entry requires implementation_running with F003-T01 active.

## Context
- The blocker is agent-recoverable state corruption after F003-T01 quality gates: typecheck passed and npm test failed. The advisory protoBlockerFlows refinement is not treated as a confirmed root cause.

## Scope
Allowed:
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `src/doctor/`
- `tests/doctor/`
- `src/cli/`
- `tests/cli/`
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `All other repository paths`

## Constraints
- Execute as doctor with no_review_loop.
- Preserve blocker kind state_corruption and signature state-corruption-implementation-running-quality-gates-failed-after-implementing-f003-t01-npm-tes.
- Preserve the confirmed evidence that quality gates failed after F003-T01, typecheck passed, and npm test failed; do not promote the advisory test refinement to a confirmed root cause.
- Restore exactly lifecycle_state=implementation_running, active_task=F003-T01, active_correction_task=none, and active_unblock_task=none.
- Do not rewrite or delete the historical F003-T01 task; retain lineage through previous_task_id=F003-DR04.
- Use only existing state, blocker, restoration-target, and quality-gate mechanisms.
- Do not inherit the failed F003-T01 npm test gate as a doctor re-entry gate.
- Do not change source, tests, feature scope, configuration policy, or runtime contracts.
- This is the explicitly selected recovery path for a failed quality-gate transition, not a generic state correction.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- Exactly one bounded doctor recovery task is executed for this blocker.
- Feature and project state preserve the supplied blocker signature and confirmed quality-gate evidence without rewriting history.
- The recovery remains confined to the two allowed state documents.
- The fixed restoration target is applied exactly: implementation_running, F003-T01, none, none.
- Doctor recovery uses no_review_loop and re-enters deterministic execution only after all listed gates pass.
- No advisory failure detail is promoted to a confirmed root cause, and no new artifact, manifest, or validator is introduced.

## Files Likely Affected
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff 2a6e3af9 --check -- docs/features/003-doctor-command/state.md docs/compassrose/PROJECT_STATE.md
npm run typecheck
node -e "const fs=require('fs'); const s=fs.readFileSync('docs/features/003-doctor-command/state.md','utf8'); const p=fs.readFileSync('docs/compassrose/PROJECT_STATE.md','utf8'); if(!/## Lifecycle State\s+implementation_running/.test(s) || !/- active_task:\s+F003-T01/.test(s) || !/- active_correction_task:\s+none/.test(s) || !/- active_unblock_task:\s+none/.test(s) || !/Feature.*003-doctor-command.*implementation_running.*F003-T01/.test(p)) process.exit(1);"
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagno
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F003-T01; active_correction_task=none; active_unblock_task=none
- evidence: Feature 003-doctor-command is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-implementation-running-quality-gates-failed-after-implementing-f003-t01-npm-tes
- evidence: - recoverability: agent
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F003-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
