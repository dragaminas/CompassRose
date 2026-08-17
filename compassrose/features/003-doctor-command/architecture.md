# Architecture: Doctor Command

## Purpose

Doctor is a deterministic, read-only preflight layer exposed through the CLI. It consumes the project-level configuration contract and repository-local observations, evaluates the Doctor MVP readiness rules, and turns the results into structured diagnostics and human-readable terminal output.

## Relevant Modules

- `src/cli/`: CLI command registration, dispatch, process-level result handling, and the `doctor` command surface. The exact existing entrypoint file is intentionally left for task planning to locate.
- `src/doctor/`: feature-owned diagnostic types, check coordination, read-only repository observations, and report preparation.
- Existing configuration loading and validation from feature `002-configuration-model`: consumed as the canonical parser/model boundary; Doctor must not create a competing configuration model.
- Read-only filesystem, platform, and Git-repository discovery capabilities: used behind the Doctor boundary and kept platform-safe.
- `tests/doctor/` and `tests/cli/`: tests for check behavior, path safety, platform behavior, output, and command integration.

## Boundaries

This feature may affect:

- The feature-owned Doctor implementation under `src/doctor/`.
- The existing CLI surface under `src/cli/` needed to expose `compassrose doctor`.
- Paired tests under `tests/doctor/` and `tests/cli/`.

This feature must not affect:

- The configuration model, parser, or project-policy semantics owned by feature `002-configuration-model`; Doctor may consume its stable loading/validation boundary.
- Project-understanding analysis, initialization, or generated repository-state behavior owned by feature `004-project-understanding`.
- The orchestrator's workflow transitions, task model, quality-gate execution, review flow, correction flow, or autonomous modes.
- External AI roles, provider selection, adapter invocation, or any global tool configuration.
- Git workspace management, branches, diffs, commits, merges, or review integration; Doctor only performs a read-only repository-membership check.
- `docs/compassrose/CONFIG.md`, `docs/compassrose/PROJECT_STATE.md`, other project documentation, and Git metadata.

## Interfaces

### Inputs

- The current CLI invocation and current working directory.
- The repository root discovered from the current directory using a read-only, cross-platform Git/filesystem boundary.
- The canonical configuration document and its parseable YAML block.
- The parsed project-level configuration values needed by the Doctor MVP contract.
- Read-only filesystem observations for configured documentation paths.
- The normalized current platform.

### Outputs

- A structured collection of named diagnostics, each carrying a pass/fail result and enough context to identify the relevant check, field, or path.
- A human-readable terminal report headed by `CompassRose Doctor`, with clear per-check results and an overall `Status: OK` when all required checks pass.
- A non-success CLI result when the repository is not ready, without changing repository state.

## Dependencies

- The completed project-level configuration loader/model and its documented Doctor MVP subset from feature `002-configuration-model`.
- `docs/compassrose/CONFIG.md`, especially the `Doctor MVP configuration contract` and `Command presence semantics` sections.
- The configured documentation paths, including `ROADMAP.md`, `PROJECT_STATE.md`, `CONFIG.md`, and the contracts root.
- Node/TypeScript filesystem and runtime platform capabilities, isolated so Linux and Windows behavior remains explicit.
- Read-only Git repository discovery or existing Git metadata utilities.
- The repository's existing CLI and test conventions, to be located during task planning.

## Constraints

- Doctor must not call AI tools or any external AI adapter.
- Doctor must not execute configured project commands. An empty command is intentionally valid; a non-empty command is validated as a string, not run or probed.
- Doctor must not modify files, directories, configuration, Git metadata, or global user settings.
- Paths from configuration must be resolved relative to the repository root and accepted only when they remain inside that repository.
- Platform detection must normalize the runtime's platform identifiers to the configuration vocabulary (`linux` and `windows`) without Unix-only assumptions.
- A malformed configuration must produce a diagnostic result rather than an uncaught parser failure.
- Checks should remain independently reportable so one missing prerequisite does not erase other useful diagnostics.
- The implementation must preserve the CLI-first, repository-centric, deterministic architecture.

## Architectural Decisions

- Doctor is a consumer of the configuration model, not a second configuration system.
- Doctor separates check evaluation from presentation: checks return structured results and the CLI renders them for humans.
- Repository readiness is evaluated from read-only observations; no repair, initialization, command execution, or AI delegation is implicit in the command.
- The Doctor MVP validates the required subset documented in `CONFIG.md` and does not require future-facing configuration sections outside that subset.
- The overall command status is successful only when all required checks pass; failures remain visible as named diagnostics.
- Git detection is a narrow preflight capability and does not become general Git workspace integration.

## Design Notes

- The canonical config path is checked before parsing. If it is missing or cannot be parsed, later config-dependent checks should be represented as unavailable or failed with an explanatory reason rather than causing an opaque crash.
- The required documentation checks cover the paths named by `project.documentation_root`, `documentation.roadmap`, `documentation.project_state`, `documentation.config`, and `documentation.contracts_root`.
- `adapters.external_cli.type` must equal `external_cli` for the MVP; Doctor does not validate or invoke the configured adapter command.
- The four required command keys are valid when present with an empty string or a non-empty shell command string. Doctor does not infer whether a command is executable.
- The current directory may be nested inside the repository; all repository-relative path checks should use the detected repository root.
- Output should use stable check names and avoid exposing sensitive user-level configuration because the command is intended for debugging.

## Risks And Open Questions

- The supplied planning sources do not identify the current physical CLI entrypoint or the existing configuration-loader file path; task planning must bind these logical boundaries to repository reality without widening the feature scope.
- Git worktrees and platform-specific path behavior may represent repository metadata as a `.git` file rather than a directory; the read-only detector must account for supported repository layouts.
- A configuration path that is syntactically present but resolves outside the repository must be reported as invalid, not read.
- The existing project-state preflight introduced with feature `002-configuration-model` may overlap with the new report; implementation should reuse its behavior or integrate the diagnostic without duplicating policy.
- The exact wording of failure details can evolve as long as the check identity, relevant context, and overall status remain clear and stable.
