# Task F003-DR06: Reconcile the F003-T01 quality-failure handoff for doctor re-entry

## Task ID
`F003-DR06`

## Task Lineage

- previous_task_id: `F003-DR05`

## Parent Feature
`003-doctor-command`

## Goal
Preserve the confirmed F003-T01 quality-gate failure and tighten the existing doctor re-entry handoff so the runtime restores implementation_running with F003-T01 active and no correction or unblock task after the recovery gates pass.

## First Executable Step
Edit docs/features/003-doctor-command/state.md to preserve the supplied blocker record and explicitly record the fixed restoration anchor for F003-T01 without deleting the failed quality-gate history.

## Minimum Progress Evidence
- The feature state and project state contain a new bounded F003-DR06 recovery record while retaining the original blocker signature and npm test failure evidence.
- The existing F003-T01 task remains historical evidence and is linked through recovery lineage without changing its implementation scope or acceptance criteria.
- The doctor-recovery and operation-loop contract text explicitly preserves doctor/no_review_loop execution, recovery-owned re-entry gates, and runtime application of the fixed restoration target.

## Trace
- Roadmap objective: Keep deterministic, repository-local workflow execution recoverable after a bounded blocker.
- Feature goal: Provide a deterministic, read-only Doctor command with feature-owned diagnostics and clear readiness reporting.
- State gap: The recorded quality failure leaves F003-T01 at a quality_failed recovery checkpoint, while the runtime-supplied forward target is implementation_running with F003-T01 active and no correction or unblock task.

## Context
- The blocker is classified as recoverable state corruption after F003-T01 implementation. Typecheck passed, npm test failed, and no independently verified root cause beyond that failure is assumed. The recovery must preserve the failure as history and repair the doctor handoff rather than inherit the failed implementation gate.

## Scope
Allowed:
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`

Forbidden:
- `src/doctor/**`
- `src/cli/**`
- `src/config/**`
- `src/orchestrator/**`
- `src/git/**`
- `tests/**`
- `docs/compassrose/CONFIG.md`
- `docs/features/003-doctor-command/feature.md`
- `docs/features/003-doctor-command/architecture.md`
- `docs/features/003-doctor-command/tasks/* other than the explicitly allowed F003-T01 task`
- `all other src/contracts/**`
- `Git metadata and files outside the listed paths`

## Constraints
- Execute as doctor with no_review_loop semantics.
- Preserve blocker kind state_corruption, signature state-corruption-implementation-running-quality-gates-failed-after-implementing-f003-t01-npm-tes, recoverability agent, observed state, and supplied evidence.
- Treat the protoBlockerFlows refinement as advisory and do not claim it is the confirmed root cause.
- Do not inherit F003-T01's failed npm test as a doctor re-entry gate.
- Do not delete or rewrite the earlier F003-T01 task or its implementation evidence.
- Do not invent a manifest, validator, or artifact type.
- Use the fixed restoration target exactly: implementation_running, F003-T01, none, none.
- Any git diff gate must use an explicit pre-recovery ref before the pathspec separator.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The original state_corruption blocker signature, observed state, typecheck-pass evidence, npm-test-failure evidence, and F003-T01 lineage remain preserved as historical records.
- The feature and project state documents record the bounded F003-DR06 handoff and retain F003-T01 as the active restoration anchor.
- The doctor-recovery and operation-loop contracts explicitly support doctor execution with no_review_loop, recovery-owned re-entry gates, and restoration only after those gates pass.
- The earlier F003-T01 task remains historical evidence; its implementation scope and acceptance criteria are not broadened or replaced.
- The restoration target is exactly lifecycle_state=implementation_running, active_task=F003-T01, active_correction_task=none, and active_unblock_task=none.
- No source, test, configuration, Git metadata, unrelated feature, or runtime command behavior is changed.

## Files Likely Affected
- `docs/features/003-doctor-command/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md`

## Quality Gates to Run
```bash
git diff 2a6e3af9 --check -- docs/features/003-doctor-command/state.md docs/compassrose/PROJECT_STATE.md src/contracts/task/doctor-recovery-task.md src/contracts/runtime/operation-loop.md docs/features/003-doctor-command/tasks/001-establish-doctor-diagnostic-contract-and-read-only-check-context.md
node -e "const fs=require('fs'); const checks=[['docs/features/003-doctor-command/state.md',['## Blocked From','lifecycle_state: `implementation_running`','active_task: `F003-T01`','active_correction_task: `none`','active_unblock_task: `none`','state-corruption-implementation-running-quality-gates-failed-after-implementing-f003-t01-npm-tes']],['docs/compassrose/PROJECT_STATE.md',['F003-T01','implementation_running']]]; for(const [p,need] of checks){const s=fs.readFileSync(p,'utf8'); if(need.some(v=>!s.includes(v))) process.exit(1);}"
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
