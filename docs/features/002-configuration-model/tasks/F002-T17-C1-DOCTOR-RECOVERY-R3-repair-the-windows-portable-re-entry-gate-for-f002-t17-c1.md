# Task F002-T17-C1-DOCTOR-RECOVERY-R3: Repair the Windows-portable re-entry gate for F002-T17-C1

## Task ID
`F002-T17-C1-DOCTOR-RECOVERY-R3`

## Task Lineage

- previous_task_id: `F002-T17-C1-DOCTOR-RECOVERY-R2`

## Parent Feature
`002-configuration-model`

## Goal
Remove the recoverable state-corruption blocker by correcting the active task's non-portable runtime smoke quality gate, so doctor recovery can pass re-entry gates and restore F002-T17-C1 to implementation_running.

## First Executable Step
Edit docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md and replace only `node_modules/.bin/tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts` with `npx tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts`.

## Minimum Progress Evidence
- The active F002-T17-C1 task document contains the portable `npx tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts` gate and no longer contains the failing `node_modules/.bin/tsx` invocation.
- The corrected smoke gate exits successfully when run from the repository root on the Windows target.
- The live changed-file evidence shows only the named active task document changed; feature state, project state, source, tests, contracts, and unrelated task documents remain untouched.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as its project-level runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: Feature 002-configuration-model is blocked because doctor recovery R2 failed its re-entry quality gates on the non-portable `node_modules/.bin/tsx` smoke command; the fixed recovery target remains lifecycle=implementation_running with active task F002-T17-C1.

## Context
- This is the bounded third doctor recovery attempt under the configured recovery limit. The blocker is not pure state drift: the recorded recovery interface contains a Windows-incompatible re-entry command. Correct that task interface only, then let the runtime restore the fixed active-task checkpoint after doctor gates pass.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`

Forbidden:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/`
- `src/orchestrator/`
- `src/task/`
- `src/cli/`
- `tests/`
- `docs/features/002-configuration-model/tasks/*.md except docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `all global external-tool configuration paths`

## Constraints
- Execute as the doctor role with no_review_loop semantics.
- Preserve F002-T17-C1 as the active task anchor and preserve F002-T17-C1-DOCTOR-RECOVERY-R2 as historical lineage through previous_task_id.
- Change only the failing quality-gate command; do not alter implementation behavior, source scope, test scope, acceptance criteria, or task identity.
- Use the existing runtime smoke script and preserve its existing arguments exactly.
- Do not edit feature or project state; after the recovery gates pass, the runtime owns restoration to the fixed target.
- Do not add provider-specific adapter behavior or modify global external-tool configuration.
- This is bounded by limits.max_recovery_iterations=3; if this recovery fails, stop with the blocker rather than generating another recovery task.
- Use no ref-less git diff --exit-code gate; any such gate would require the explicit commit preceding the recovered task, which is not supplied here.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The active F002-T17-C1 task document uses `npx tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts` for the runtime smoke re-entry gate.
- The failing `node_modules/.bin/tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts` invocation is removed from that task document.
- The smoke gate succeeds from the repository root on the supported Windows platform.
- No source, test, feature-state, project-state, contract, configuration, or unrelated task-document changes are introduced.
- The recovery remains doctor-only and does not enter the normal reviewer loop.
- After the doctor quality gates pass, deterministic runtime re-entry restores lifecycle_state=implementation_running, active_task=F002-T17-C1, active_correction_task=none, and active_unblock_task=none.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/state/feature-state.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
npx tsx scripts/runtimeSmokeTest.mjs src/cli/main.ts
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
- observed_state: lifecycle=blocked; active_task=F002-T17-C1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-unblock-pending-doctor-recovery-f002-t17-c1-doctor-recovery-r2-failed-its-re-en
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T17-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
