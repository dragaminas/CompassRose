# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`003-doctor-command`

## Current Reality

- Feature `002-configuration-model` is complete: every task request in its Implementation Outline (`F002-TR01`-`F002-TR05`) is `complete`, most recently `F002-TR05` via the approved correction chain `F002-T17` → `F002-T17-C1` → `F002-T17-C1-CORRECTION-R1`.
- No feature is currently active; task planning should select `003-doctor-command`, the earliest numbered feature still pending formalization.
- The active feature pointer currently targets `003-doctor-command`; the detailed task and lifecycle state for that feature lives in `docs/features/003-doctor-command/state.md`.
- Feature `003-doctor-command` now has a planned next task, `F003-T01`, ready to execute.

## Implemented

- `docs/compassrose/CONFIG.md` and `docs/compassrose/PROJECT_STATE.md` are present as the project-local operational documents.
- The feature-001 foundation documents are formalized under `docs/features/001-project-identity-and-foundation/`.
- The feature-002 configuration documents are formalized under `docs/features/002-configuration-model/`.
- The package metadata recovery bundle is accepted and backed by the configured validation commands.
- Feature `001-project-identity-and-foundation` now has aligned package metadata, TypeScript settings, and top-level foundation documentation.
- `compassrose doctor` now validates the configured project-state document as a dedicated runtime preflight check.
- Feature `002-configuration-model` is complete: repository-local configuration loading/validation, Doctor/runtime integration, and the bounded correction-task allocator are all implemented and quality-gated.

## Pending

- Execute `F003-T01` for the active feature.
- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

Feature `003-doctor-command` was formalized by the prototype orchestrator.

## Known Gaps

- `classifyBlockerKind` misroutes a blocked-feature recovery hint toward doctor-recovery instead of the actual right action (seen twice: sibling-feature scope, and exhausted task requests). Tracked as fix `001-blocked-feature-scope-misclassification` (formalized, severity medium, not yet implemented).
- No runtime code path transitions a feature from an exhausted-task-requests block directly to `completed`; feature `002-configuration-model`'s completion was applied directly rather than by the runtime. See that feature's own `state.md` Known Gaps for detail.

## Next Planning Hint

The active feature is `003-doctor-command`, and its next valid action is to execute `F003-T01`.
