# State: Project Identity and Foundation

## Status

In progress

## Active Feature

`023-terminal-session`

## Current Reality

- The specification round of 2026-08-22 re-cut the original twenty-two component requests into seven product features, `023` through `029`. See `features/README.md` for the full mapping and the round's coverage report.
- Features `001-project-identity-and-foundation`, `002-configuration-model`, and `003-doctor-command` are complete.
- Feature `023-terminal-session` is implemented and usable: `compassrose` with no arguments opens the interactive session, and the old no-argument behavior moved to `compassrose run`. Its live view has a documented limitation — no in-step interruption or animated progress, because `run()` is synchronous.
- Features `024` through `029` are formalized and validated by that round; none are implemented yet.
- Requests `021-vscode-integration` and `022-ecosystem-and-metrics` remain pending specification, deliberately.
- Two dimensions are recorded as uncovered, not out of scope: distribution/installation, and execution trust.
- Nothing is blocked.

## Implemented

- `compassrose/CONFIG.md` and `compassrose/PROJECT_STATE.md` are present as the project-local operational documents.
- Feature `001-project-identity-and-foundation` has aligned package metadata, TypeScript settings, and top-level foundation documentation.
- Feature `002-configuration-model` is complete: repository-local configuration loading and validation, Doctor and runtime integration, and the bounded correction-task allocator.
- Feature `003-doctor-command` is complete: `compassrose doctor` performs read-only readiness diagnostics for the repository, configuration, platform, documentation paths, project state, and blocked work, and satisfies all thirteen of its acceptance criteria.
- Fixes `001-blocked-feature-scope-misclassification`, `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts`, and `003-pre-existing-failure-in-docs-features-003-doctor-command-state-md` are complete.
- Substantial machinery for the automated loop already exists across `src/orchestrator/`, `src/agents/`, `src/planner/`, `src/task/`, and `src/git/`. Features `025` through `027` rework and bound it rather than building it from nothing.

## Pending

- Implement features `023` through `029`, in numeric order.
- Specify requests `021` and `022` when they become relevant.

## Blocked

- None

## Last Approved Change

Feature `003-doctor-command` was closed after its final outstanding acceptance criterion — the
documented success shape `CompassRose Doctor` / `Status: OK` — was satisfied.

## Known Gaps

- No runtime code path transitions a feature from an exhausted outline to `completed`; both `002` and `003` were closed by hand. Feature `025-automated-development-loop` adds that path.
- The provider-specific adapters in `src/agents/` (`codexCli.ts`, `openCodeCli.ts`) contradict absorbed request `010-generic-external-cli-adapter`, which explicitly excluded them. Feature `025-automated-development-loop` owns the reconciliation.
- This repository's own e2e suite clones the current `HEAD`, so a feature or fix sitting in a non-terminal lifecycle state can make unrelated tests fail. The standing cause of that — feature `003` recorded as blocked, plus `tests/stateCorrectionLimit.test.ts` mutating the live repository on every run — is fixed; the harness's dependence on `HEAD` remains.

## Next Planning Hint

Implement `023-terminal-session` first: it is the frame the other five plug into, and the only one
with no dependency on the others.
