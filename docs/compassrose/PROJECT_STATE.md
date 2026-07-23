# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`003-doctor-command`

## Current Reality

- Feature `003-doctor-command` is `implementation_running` for `F003-T01`, restored by hand
  after deleting fix `004-orchestration-quality-failure-attribution-and-recovery-state-
  transition-defect` (never a real defect) and repairing the actual root cause -- see Known Gaps.

## Implemented

- `docs/compassrose/CONFIG.md` and `docs/compassrose/PROJECT_STATE.md` are present as the project-local operational documents.
- The feature-001 foundation documents are formalized under `docs/features/001-project-identity-and-foundation/`.
- The feature-002 configuration documents are formalized under `docs/features/002-configuration-model/`.
- The package metadata recovery bundle is accepted and backed by the configured validation commands.
- Feature `001-project-identity-and-foundation` now has aligned package metadata, TypeScript settings, and top-level foundation documentation.
- `compassrose doctor` now validates the configured project-state document as a dedicated runtime preflight check.
- Feature `002-configuration-model` is complete: repository-local configuration loading/validation, Doctor/runtime integration, and the bounded correction-task allocator are all implemented and quality-gated.
- Feature `003-doctor-command` is formalized; its task `F003-T01` implementation attempt
  remains the active restoration target and is not claimed complete by this recovery.
- Fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` is complete: `npm test` passes cleanly.
- Fix `003-pre-existing-failure-in-docs-features-003-doctor-command-state-md` is complete: `npm test` passes cleanly.

## Pending

- Resume `F003-T01` implementation deterministically.
- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

Fix `004-orchestration-quality-failure-attribution-and-recovery-state-transition-defect`
deleted by hand; feature `003-doctor-command` restored to `implementation_running`/`F003-T01`.
Root cause repaired in commit `2a6e3af9`.

## Recovery History

- `FX002-T03` failed its doctor re-entry quality gates.
- Historical blocker kind: `task_interface_gap`.
- Historical blocker signature: `task-interface-gap-unblock-pending-doctor-recovery-fx002-t03-failed-its-re-entry-quality-gates-n`.
- Historical blocker evidence: `npm test` timed out in `tests/taskRequestScopeEnforcement.test.ts`.
- `FX002-T01`'s review-blocked result chained internally into diagnostic autocorrection
  (`FX002-T07`) within the same long-running `npm run dev` invocation, overwriting a
  first manual completion edit made while that process was still running. Re-applied
  once no orchestrator process was confirmed running. See fix `002`'s own `state.md`
  Known Gaps.
- `F003-T01`'s subsequent retry hit the same `blockOnUnrelatedFixFailure`
  misattribution pattern a second time (fix `003`, actually caused by
  `tests/protoBlockerFlows.test.ts` running too close to the suite timeout under
  contention; fixed in commit `3f02b62c`).
- Doctor recovery `F003-DR01` preserved the supplied `state_corruption` blocker
  signature `state-corruption-quality-failed-plan-one-bounded-doctor-recovery-task-to-preserve-the-blocker-ev`,
  the supplied planning evidence, `blocker_evidence: None`, and
  `lifecycle=quality_failed`. No concrete failed-gate output or
  implementation-failure evidence was available in the original blocker record;
  the `protoBlockerFlows.test.ts` refinement remains advisory and unverified.
- Doctor recovery task `F003-DR03` preserves the supplied environment blocker
  metadata: blocker kind: environment; blocker signature:
  environment-quality-failed-feature-003-doctor-command-is-in-quality-failed-and-needs-diagnosis-a;
  recoverability: human; observed state:
  `lifecycle=quality_failed; active_task=F003-T01; active_correction_task=none; active_unblock_task=none`.
- The supplied recovery context also preserves blocker kind: `state_corruption`,
  blocker signature:
  `state-corruption-quality-failed-a-single-doctor-recovery-task-confined-to-feature-003-can-reconc`,
  and blocker evidence: `A single doctor recovery task confined to Feature 003 can
  reconcile the stale restoration state, preserve the missing blocker evidence, and
  establish executable re-entry gates for F003-T01. The documents do not establish
  that this specific blocker is systemic.`, `None`, and `lifecycle=quality_failed`.
- No concrete failed-gate output or implementation-failure evidence is available
  for the F003-DR03 handoff. Its fixed restoration target is
  `lifecycle_state=implementation_running`, `active_task=F003-T01`,
  `active_correction_task=none`, and `active_unblock_task=none`; the runtime applies
  that target only after every `quality_gates.before_review` gate passes.
- Diagnostic/autocorrection then classified the recurring "no concrete failed-gate evidence"
  observation itself as a systemic defect and filed fix `004-orchestration-quality-failure-
  attribution-and-recovery-state-transition-defect` (critical severity, no falsifiable
  acceptance criterion). Deleted by hand: the real defect was
  `updateFeatureStateAfterImplementation()`'s `quality_failed` branch never writing a
  `Blocked By` block at all (unlike every other blocked transition), so no diagnostic call in
  this chain ever had real evidence to reason about. Fixed at the source in commit `2a6e3af9`.

## Known Gaps

- `classifyBlockerKind` misroutes a blocked-feature recovery hint toward doctor-recovery instead of the actual right action (seen twice: sibling-feature scope, and exhausted task requests). Tracked as fix `001-blocked-feature-scope-misclassification` (formalized, severity medium, not yet implemented).
- No runtime code path transitions a feature from an exhausted-task-requests block directly to `completed`; feature `002-configuration-model`'s completion was applied directly rather than by the runtime. See that feature's own `state.md` Known Gaps for detail.
- A task misattributed to a nonexistent/irrelevant file scope (via `blockOnUnrelatedFixFailure`'s noisy `referencedPaths[0]` heuristic) has no runtime path out of the implement -> review-blocked -> doctor-recovery cycle, even after its fix's real completion criterion is independently satisfied elsewhere. Observed twice (fixes `002` and `003`); repaired at the source in commit `ba080611`.
- A single non-loop `npm run dev` invocation is not always a quickly-observable atomic unit: a review-blocked result can chain internally into diagnostic autocorrection and further doctor-recovery planning within the same process, taking several more minutes past the point a supervisor might reasonably believe the run has finished. See fix `002`'s own `state.md` Known Gaps for detail.
- `npm test` run as part of a task's own quality gates can intermittently fail for a reason
  unrelated to any code defect while any feature/fix sits in a non-terminal lifecycle state:
  this repository's own e2e test suite clones the *current* HEAD, so it can pick up that
  in-progress state and fail in ways its scripted mock CLI responses don't anticipate. See
  feature `003-doctor-command`'s own `state.md` Known Gaps for detail.

## Next Planning Hint

Resume feature `003-doctor-command`'s task `F003-T01` implementation deterministically.
