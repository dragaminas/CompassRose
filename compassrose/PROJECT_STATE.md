# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`003-doctor-command`

## Current Reality

- Feature `003-doctor-command` is `implementation_running` for `F003-T01`, restored by the
  bounded F003-DR05 doctor recovery after preserving the failed F003-T01 quality-gate evidence
  and deleting fix
  `004-orchestration-quality-failure-attribution-and-recovery-state-transition-defect` (never a
  real defect) and repairing the actual root cause -- see Known Gaps.
- Feature `003-doctor-command` state was canonicalized; the active task pointer remains `F003-T01`.
- F003-DR04 is the successor to F003-DR03; its literal doctor re-entry gates passed and its
  restoration target is applied. The F003-T01 implementation remains incomplete.
- Feature `003-doctor-command` recovered from a blocker through doctor recovery task `F003-DR04`; the active task pointer was restored to `F003-T01`.
- Feature `003-doctor-command` completed doctor recovery task `F003-DR05`; the active task pointer remains `F003-T01` in `implementation_running`.
- Feature `003-doctor-command` recovered from a blocker through doctor recovery task `F003-DR05`; the active task pointer was restored to `F003-T01`.
- Feature `003-doctor-command` completed doctor recovery task `F003-DR06`; its fixed restoration
  target is applied with `implementation_running`, `F003-T01` active, and no correction or unblock
  task.
- Feature `003-doctor-command` recovered from a blocker through doctor recovery task `F003-DR06`; the active task pointer was restored to `F003-T01`.

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
- Fix `001-blocked-feature-scope-misclassification` is complete: `recordBlockedFeature`/`persistBlockedFeature` now accept explicit blocker-kind/next-planning-hint metadata for the sibling-feature-scope and exhausted-task-request paths instead of reconstructing it from `classifyBlockerKind`.

## Pending

- Recover or finish implementation for `F003-T01-C02`.
- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

Doctor recovery task `F003-DR06` passed re-entry quality gates and was applied by the prototype orchestrator.

## Recovery History

- Compacted 5 doctor recovery cycle(s) recorded before this point (F003-DR01, F003-DR03, F003-DR04, F003-DR05, F003-DR06). Full detail: `.git/proto-compassrose/blockers/`, `.git/proto-compassrose/recovery-lessons/`, and git history.

## Known Gaps

- No runtime code path transitions a feature from an exhausted-task-requests block directly to `completed`; feature `002-configuration-model`'s completion was applied directly rather than by the runtime. See that feature's own `state.md` Known Gaps for detail.
- A task misattributed to a nonexistent/irrelevant file scope (via `blockOnUnrelatedFixFailure`'s noisy `referencedPaths[0]` heuristic) has no runtime path out of the implement -> review-blocked -> doctor-recovery cycle, even after its fix's real completion criterion is independently satisfied elsewhere. Observed twice (fixes `002` and `003`); repaired at the source in commit `ba080611`.
- A single non-loop `npm run dev` invocation is not always a quickly-observable atomic unit: a review-blocked result can chain internally into diagnostic autocorrection and further doctor-recovery planning within the same process, taking several more minutes past the point a supervisor might reasonably believe the run has finished. See fix `002`'s own `state.md` Known Gaps for detail.
- `npm test` run as part of a task's own quality gates can intermittently fail for a reason
  unrelated to any code defect while any feature/fix sits in a non-terminal lifecycle state:
  this repository's own e2e test suite clones the *current* HEAD, so it can pick up that
  in-progress state and fail in ways its scripted mock CLI responses don't anticipate. See
  feature `003-doctor-command`'s own `state.md` Known Gaps for detail.

## Next Planning Hint

The active feature is `003-doctor-command`, and subtask execution for `F003-T01-C02` is in progress.
