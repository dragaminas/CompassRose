# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`002-configuration-model`

## Current Reality

- Feature `002-configuration-model` is blocked by `state-corruption-blocked-diagnostic-autocorrection-returned-malformed-or-incomplete-structured-o`.
- Blocker recoverability: agent.
- Feature `002-configuration-model` was suspended from `task_ready`; the active task pointer remains `F002-T04-C3-U1-C1-U1`.
- Blocking task context: `F002-T04-C3-U1-C1-U1`
- Feature `002-configuration-model` now has a planned doctor recovery task, `F002-T04-C3-U1-C1-U1-U1`, to resolve a recoverable blocker and restore `task_ready`.

## Implemented
- `docs/compassrose/CONFIG.md` and `docs/compassrose/PROJECT_STATE.md` are present as the project-local operational documents.
- The feature-001 foundation documents are formalized under `docs/features/001-project-identity-and-foundation/`.
- The feature-002 configuration documents are formalized under `docs/features/002-configuration-model/`.
- The package metadata recovery bundle is accepted and backed by the configured validation commands.
- Feature `001-project-identity-and-foundation` now has aligned package metadata, TypeScript settings, and top-level foundation documentation.
- `compassrose doctor` now validates the configured project-state document as a dedicated runtime preflight check.

## Pending

- Execute doctor recovery task `F002-T04-C3-U1-C1-U1-U1` for the active feature.
- Continue updating this file with approved repository facts as feature work lands.

## Blocked

- None

## Last Approved Change

Task `F002-T04` was approved, extending the typed config loader to validate and expose `execution`, `roles`, and `git_policy` data from the canonical project config.

## Known Gaps

- Feature `002-configuration-model` now has validated runtime-precondition policy data in the config loader, but the broader runtime loop still needs to consume that data in a concrete orchestration entrypoint.
- The root `F002-T04-C3` attempt has a partial implementation attempt (no diff) and omitted the required Implementation Notes justification, so the current correction task must keep that evidence visible instead of inferring a fresh retry.
- The latest hardening attempt also failed against a stale edit preimage, so the next run needs an explicit diagnostic before any retry instead of silently attempting the same replacement again.

## Next Planning Hint

The active feature is `002-configuration-model`, and its next valid action is to execute doctor recovery task `F002-T04-C3-U1-C1-U1-U1` from the captured `task_ready` state.
