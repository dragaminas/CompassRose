# Task F003-DR04: Reconcile the F003-T01 doctor recovery handoff after quality-gate state corruption

## Task ID
`F003-DR04`

## Task Lineage

- previous_task_id: `F003-DR03`

## Parent Feature
`003-doctor-command`

## Goal
Preserve the confirmed F003-T01 quality-gate blocker and repair the stale feature, project, and task handoff so the doctor executor can pass bounded re-entry gates and restore the fixed implementation_running/F003-T01 checkpoint without claiming the implementation is complete.

## First Executable Step
Edit only the existing F003-T01 task handoff, feature state, and project state paths to record F003-DR04 as the successor to F003-DR03, preserve the exact blocker signature and supplied evidence, and make the existing doctor, no_review_loop, blocker, restoration_target, and literal re-entry-gate fields explicit.

## Minimum Progress Evidence
- The feature and project state preserve blocker signature state-corruption-implementation-running-quality-gates-failed-after-implementing-f003-t01-npm-tes and the F003-T01 restoration anchor.
- The F003-T01 handoff records F003-DR04 as the later recovery while retaining F003-DR03 as historical lineage and does not claim implementation completion.
- The recovery interface contains the existing doctor_recovery executor_role=doctor, review_policy=no_review_loop, blocker, restoration_target, and bounded re-entry gate fields.
- git diff 2a6e3af9 --check and npm run typecheck both exit successfully.

## Trace
- Roadmap objective: Keep CompassRose's deterministic, repository-local workflow resumable after a recoverable failure.
- Feature goal: Provide a deterministic, read-only Doctor command with independently diagnosable readiness checks and safe workflow integration.
- State gap: The diagnostic requires recovery from a quality-gate failure while preserving F003-T01, but feature state is quality_failed with no active recovery task and project state records a conflicting implementation-running checkpoint.

## Context
- The latest diagnostic classifies this as recoverable agent state corruption after F003-T01 implementation: typecheck passed, npm test failed, and the runtime must plan one bounded doctor recovery. The advisory refinement is not adopted as a confirmed implementation or test root cause. Existing contracts already define the recovery fields, no-review-loop behavior, forward restoration target, explicit blocker evidence, and independent doctor re-entry gates.

## Scope
Allowed:
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`

Forbidden:
- `src/doctor/`
- `src/cli/`
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `tests/`
- `docs/compassrose/CONFIG.md`
- `docs/features/003-doctor-command/feature.md`
- `docs/features/003-doctor-command/architecture.md`
- `docs/features/other features/`
- `docs/fixes/`
- `Git metadata`
- `global user configuration`

## Constraints
- Execute as doctor with no_review_loop; do not open a normal reviewer loop.
- Preserve the exact blocker kind, primary signature, supplied evidence, observed state, and recovery lineage; do not rewrite failed history as success.
- Keep active_task anchored to F003-T01, active_correction_task as none, and active_unblock_task as none in the fixed restoration target.
- The runtime applies the restoration target only after every doctor recovery gate passes.
- Doctor re-entry gates are the complete gate set and must not inherit F003-T01's failed npm test gate unless explicitly listed by this recovery.
- Use only fields and mechanisms already defined by the supplied contracts; do not invent a manifest, validator, or artifact type.
- Do not modify Doctor implementation, tests, feature intent, configuration policy, orchestration source, Git metadata, or unrelated features.
- Use 2a6e3af9 as the explicit pre-recovery diff reference; never use a bare git diff comparison against HEAD.
- The advisory recent implementation-failure refinement is unverified and must not be treated as a confirmed root cause.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- Exactly one doctor recovery task is produced: F003-DR04.
- F003-DR03 remains historical through previous_task_id; no near-duplicate correction task is created.
- The exact blocker signature and supplied quality-gate evidence remain preserved.
- The recovery handoff uses executor_role=doctor and review_policy=no_review_loop.
- The restoration target is exactly lifecycle_state=implementation_running, active_task=F003-T01, active_correction_task=none, active_unblock_task=none.
- The task changes only the bounded feature/project/task recovery interface paths and does not alter F003-T01 implementation or claim feature completion.
- All before_review entries are literal runnable shell commands, and the diff gate uses an explicit ref before its pathspec separator.
- The recovery does not invent a new artifact, validator, manifest, or quality-gate mechanism.

## Files Likely Affected
- `src/contracts/planner/doctor-recovery-planning-prompt.md`
- `src/contracts/planner/input.md`
- `src/contracts/planner/output.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/003-doctor-command/feature.md`
- `docs/features/003-doctor-command/architecture.md`
- `docs/features/003-doctor-command/state.md`
- `docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`

## Quality Gates to Run
```bash
git diff 2a6e3af9 --check -- docs/features/003-doctor-command/state.md docs/compassrose/PROJECT_STATE.md docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md
npm run typecheck
node -e "const fs=require('fs'); const a=fs.readFileSync('docs/features/003-doctor-command/state.md','utf8'); const b=fs.readFileSync('docs/compassrose/PROJECT_STATE.md','utf8'); if(!a.includes('F003-T01')||!a.includes('state-corruption-implementation-running-quality-gates-failed-after-implementing-f003-t01-npm-tes')||!b.includes('F003-T01')) process.exit(1)"
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
