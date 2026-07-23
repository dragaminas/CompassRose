# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`003-doctor-command`

## Current Reality

- Feature `003-doctor-command` is blocked by `state-corruption-implementation-running-doctor-recovery-f003-dr01-failed-its-re-entry-quality-ga`.
- Blocker recoverability: agent.
- Feature `003-doctor-command` was suspended from `implementation_running`; the active task pointer remains `F003-T01`.
- Blocking task context: `F003-DR01`

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

- Plan a doctor recovery task for the active feature.
- Restore the captured `implementation_running` state after the blocker is resolved.
- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

Fix `003-pre-existing-failure-in-docs-features-003-doctor-command-state-md` reached completed; `003-doctor-command` resumed automatically.

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

## Known Gaps

- `classifyBlockerKind` misroutes a blocked-feature recovery hint toward doctor-recovery instead of the actual right action (seen twice: sibling-feature scope, and exhausted task requests). Tracked as fix `001-blocked-feature-scope-misclassification` (formalized, severity medium, not yet implemented).
- No runtime code path transitions a feature from an exhausted-task-requests block directly to `completed`; feature `002-configuration-model`'s completion was applied directly rather than by the runtime. See that feature's own `state.md` Known Gaps for detail.
- A task misattributed to a nonexistent/irrelevant file scope (via `blockOnUnrelatedFixFailure`'s noisy `referencedPaths[0]` heuristic) has no runtime path out of the implement -> review-blocked -> doctor-recovery cycle, even after its fix's real completion criterion is independently satisfied elsewhere. Observed twice (fixes `002` and `003`). See fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`'s own `state.md` Known Gaps for detail.
- A single non-loop `npm run dev` invocation is not always a quickly-observable atomic unit: a review-blocked result can chain internally into diagnostic autocorrection and further doctor-recovery planning within the same process, taking several more minutes past the point a supervisor might reasonably believe the run has finished. See fix `002`'s own `state.md` Known Gaps for detail.

## Next Planning Hint

Plan a doctor recovery task for blocker `state-corruption-implementation-running-doctor-recovery-f003-dr01-failed-its-re-entry-quality-ga` and then restore `implementation_running`.
