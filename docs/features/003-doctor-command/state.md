# State: Doctor Command

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F003-T01
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run
- doctor_recovery_attempts: 0
- blocked_on_fix: none

## Current Reality

- `docs/features/003-doctor-command/request.md` is the human-authored request being formalized.
- `docs/compassrose/CONFIG.md` contains the canonical project-level configuration example, the Doctor MVP configuration contract, command-presence semantics, and the expected successful Doctor output shape.
- Feature `002-configuration-model` is recorded as complete and provides repository-local configuration loading/validation plus Doctor/runtime integration.
- `docs/compassrose/PROJECT_STATE.md` records an existing dedicated runtime preflight check for the configured project-state document, but it does not establish that the full `compassrose doctor` readiness command is complete.
- No feature-specific implementation deliverable for the complete Doctor command is claimed complete by this feature state.

Task `F003-T01` remains the active implementation target for deterministic re-entry. Doctor recovery task `F003-DR03` reconciles state and evidence only; it does not change the implementation attempt, and the runtime applies the restoration target after the recovery gates pass.

## Implemented Deliverables

- The canonical feature documentation set is formalized for this feature.
- The repository-local configuration contract and its Doctor MVP rules already exist as shared project inputs.
- A project-state preflight behavior is already recorded as part of feature `002-configuration-model`; it is treated as a reusable prerequisite or partial existing behavior, not re-owned here.

## Remaining Deliverables

- Define the feature-owned structured diagnostic boundary for Doctor.
- Implement the read-only MVP readiness checks for configuration, required documentation, platform, Git repository membership, and configured-command semantics.
- Expose the checks through `compassrose doctor` with clear human-readable output and an overall readiness result.
- Add automated coverage for passing and failing checks, cross-platform behavior, path containment, output, and read-only/no-external-execution guarantees.

## Outline Progress

- 1. Doctor diagnostic contract: in progress
- 2. Repository readiness checks: not started
- 3. CLI reporting and command integration: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Restored to `implementation_running`/`F003-T01` by hand after deleting fix
`004-orchestration-quality-failure-attribution-and-recovery-state-transition-defect`
(never a real defect -- see Known Gaps) and repairing the actual root cause in
commit `2a6e3af9`.

## Recovery History

- Doctor recovery task `F003-DR01` preserves the supplied blocker kind `state_corruption` and blocker signature `state-corruption-quality-failed-plan-one-bounded-doctor-recovery-task-to-preserve-the-blocker-ev`.
- Supplied blocker evidence is preserved: `Plan one bounded doctor recovery task to preserve the blocker evidence, reconcile the stale feature/project state and restoration target, and establish executable re-entry gates for F003-T01. The available evidence does not justify filing a systemic blocker.`, `blocker_evidence: None` (no additional evidence supplied), and `lifecycle=quality_failed`.
- The failed quality-gate result remains historical evidence. No concrete failed-gate output or implementation-failure evidence was available in the original blocker record; the advisory `protoBlockerFlows.test.ts` refinement remains unverified rather than confirmed failure evidence. The later recovery-gate result is reported in the handoff notes and is not added to blocker evidence.
- The required pre-edit `npm test` baseline on 2026-07-23 timed out after 120 seconds with exit code `124` and no test output. No persisted raw failed-gate output was available.
- Doctor recovery task `F003-DR03` records the supplied environment blocker metadata: blocker kind: environment; blocker signature: environment-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagnosis-a; recoverability: human; observed state: `lifecycle=quality_failed; active_task=F003-T01; active_correction_task=none; active_unblock_task=none`.
- The supplied recovery context is preserved for the state-corruption handoff: blocker kind: `state_corruption`; blocker signature: `state-corruption-quality-failed-a-single-doctor-recovery-task-confined-to-feature-003-can-reconc`; blocker evidence: `A single doctor recovery task confined to Feature 003 can reconcile the stale restoration state, preserve the missing blocker evidence, and establish executable re-entry gates for F003-T01. The documents do not establish that this specific blocker is systemic.`, `None`, and `lifecycle=quality_failed`.
- No concrete failed-gate output or implementation-failure evidence is available for this handoff. The advisory `protoBlockerFlows.test.ts` refinement remains unverified and is not promoted to confirmed evidence. The fixed restoration target remains `lifecycle_state=implementation_running`, `active_task=F003-T01`, `active_correction_task=none`, and `active_unblock_task=none`; the runtime applies it only after every `quality_gates.before_review` gate passes.
- Diagnostic/autocorrection then classified the recurring "no concrete failed-gate evidence"
  observation itself as a systemic defect and filed fix
  `004-orchestration-quality-failure-attribution-and-recovery-state-transition-defect` (critical
  severity, no falsifiable acceptance criterion). Deleted by hand: the repeated "no concrete
  evidence" observation was itself the symptom of a real bug --
  `updateFeatureStateAfterImplementation()`'s `quality_failed` branch never wrote a `Blocked By`
  block at all (unlike every other blocked transition), so no diagnostic call in this chain ever
  had real evidence to work with. Fixed at the source in commit `2a6e3af9` rather than through
  fix 004's own task chain.

## Known Gaps

- The supplied planning sources do not identify the current CLI entrypoint or the physical configuration-loader path, so those bindings remain for task planning.
- The existing project-state preflight may need to be reused or folded into the Doctor diagnostic report without duplicating configuration or runtime policy.
- The full readiness command, its complete check set, and its automated coverage remain unimplemented by this feature.
- `npm test` run as part of F003-T01's own quality gates can still intermittently fail for a
  reason unrelated to any code defect: this repository's own e2e test suite
  (`tests/protoBlockerFlows.test.ts` and similar) clones the *current* repository HEAD, so while
  feature `003-doctor-command` itself sits in a non-terminal lifecycle state, those tests can pick
  up that in-progress state and fail in ways their scripted mock CLI responses don't anticipate.
  Not a defect in F003-T01's own implementation; expected to stop once this feature reaches a
  terminal state.

## Next Planning Hint

Resume `F003-T01` implementation deterministically.
