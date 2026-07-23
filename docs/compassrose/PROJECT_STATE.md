# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`

## Current Reality

- Fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` is complete: `npm test` passes cleanly and repeatedly (commit `242670b6` removed the stale per-test timeout overrides that were the actual root cause). Marked `completed` directly; see that fix's own `state.md` for why the runtime's implement/review/doctor-recovery loop could never reach that conclusion on its own.
- No feature or fix is currently active.
- `003-doctor-command` resumed after fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` reached completed; the active task pointer was restored to `F003-T01`.
- Feature `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` now has a planned doctor recovery task, `FX002-T07`, to resolve a recoverable blocker and restore `review_pending`.

## Implemented

- `docs/compassrose/CONFIG.md` and `docs/compassrose/PROJECT_STATE.md` are present as the project-local operational documents.
- The feature-001 foundation documents are formalized under `docs/features/001-project-identity-and-foundation/`.
- The feature-002 configuration documents are formalized under `docs/features/002-configuration-model/`.
- The package metadata recovery bundle is accepted and backed by the configured validation commands.
- Feature `001-project-identity-and-foundation` now has aligned package metadata, TypeScript settings, and top-level foundation documentation.
- `compassrose doctor` now validates the configured project-state document as a dedicated runtime preflight check.
- Feature `002-configuration-model` is complete: repository-local configuration loading/validation, Doctor/runtime integration, and the bounded correction-task allocator are all implemented and quality-gated.
- Feature `003-doctor-command` is formalized; its task `F003-T01` was recorded as `blocked_on_fix` pointing at fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`, which is now `completed` -- the next `npm run dev` step should resume it deterministically (`resumeWorkItemBlockedOnFix`).
- Fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` is complete: `npm test` passes cleanly.

## Pending

- Execute doctor recovery task `FX002-T07` for the active feature.
- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

Fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` reached completed; `003-doctor-command` resumed automatically.

## Recovery History

- `FX002-T03` failed its doctor re-entry quality gates.
- Historical blocker kind: `task_interface_gap`.
- Historical blocker signature: `task-interface-gap-unblock-pending-doctor-recovery-fx002-t03-failed-its-re-entry-quality-gates-n`.
- Historical blocker evidence: `npm test` timed out in `tests/taskRequestScopeEnforcement.test.ts`.

## Known Gaps

- `classifyBlockerKind` misroutes a blocked-feature recovery hint toward doctor-recovery instead of the actual right action (seen twice: sibling-feature scope, and exhausted task requests). Tracked as fix `001-blocked-feature-scope-misclassification` (formalized, severity medium, not yet implemented).
- No runtime code path transitions a feature from an exhausted-task-requests block directly to `completed`; feature `002-configuration-model`'s completion was applied directly rather than by the runtime. See that feature's own `state.md` Known Gaps for detail.
- A task misattributed to a nonexistent file scope (via `blockOnUnrelatedFixFailure`'s noisy `referencedPaths[0]` heuristic) has no runtime path out of the implement -> review-blocked -> doctor-recovery cycle, even after its fix's real completion criterion is independently satisfied elsewhere. See fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`'s own `state.md` Known Gaps for detail.

## Next Planning Hint

The active feature is `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`, and its next valid action is to execute doctor recovery task `FX002-T07` from the captured `review_pending` state.
