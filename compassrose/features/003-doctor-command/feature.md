# Feature: Doctor Command

## Status

Planned

## Purpose

Provide a read-only `compassrose doctor` command that determines whether the current repository satisfies the minimum project-local prerequisites required for CompassRose and explains any failures in clear terminal diagnostics.

## Problem It Solves

CompassRose depends on a repository-local configuration document, project documentation, a supported runtime platform, and Git context. Without a single preflight command, users must discover missing files, malformed configuration, unsupported platforms, and repository setup problems indirectly while attempting later workflow operations.

## Scope

This feature includes:

- Exposing the `compassrose doctor` CLI command.
- Reading the canonical project-local configuration at `docs/compassrose/CONFIG.md` and parsing its YAML configuration block.
- Validating the Doctor MVP contract: required top-level sections and fields, required documentation paths, supported platform, Git-repository membership, and configured-command key/value semantics.
- Reporting each diagnostic in a human-readable form with a clear overall readiness status.
- Keeping the command read-only and independent of AI tools and configured command execution.

This feature does not include:

- Redesigning, replacing, or broadening the repository-local configuration model owned by feature `002-configuration-model`.
- Executing `commands.typecheck`, `commands.tests`, `commands.lint`, or `commands.build`; Doctor only validates that the required keys are present and that values are empty or non-empty command strings.
- Repository understanding, project initialization, or general repository analysis owned by feature `004-project-understanding`.
- Git branches, diffs, commits, workspace management, or other Git integration owned by feature `014-git-integration`.
- Invoking AI roles, external CLI adapters, providers, or reviewers.
- Modifying configuration, documentation, source files, Git metadata, or any other project-local file at runtime.

## User Value

A user can run one safe command before planning or execution and immediately see whether CompassRose is ready, which prerequisite failed, and where to look when the repository is not ready.

## Goals

- Make repository readiness observable before workflow execution.
- Reuse the completed configuration model instead of creating a second configuration parser or policy surface.
- Keep diagnostics deterministic, human-readable, cross-platform, and safe to run from a repository directory.
- Make failures useful for debugging without hiding whether the problem is configuration, documentation, platform, Git, or command-contract related.

## Acceptance Criteria

- `compassrose doctor` is available through the CLI.
- Doctor reports a missing `docs/compassrose/CONFIG.md` file.
- Doctor reports a malformed or otherwise unparsable YAML configuration block.
- Doctor validates the required MVP top-level sections: `project`, `adapters`, `commands`, and `documentation`.
- Doctor validates the required MVP fields: `project.name`, `project.supported_platforms`, `project.documentation_root`, `adapters.external_cli.type`, `commands.typecheck`, `commands.tests`, `commands.lint`, `commands.build`, `documentation.roadmap`, `documentation.project_state`, `documentation.config`, and `documentation.contracts_root`.
- Doctor verifies that `project.documentation_root`, `documentation.roadmap`, `documentation.project_state`, `documentation.config`, and `documentation.contracts_root` resolve to existing paths inside the repository.

> **Amended by ADR-0049 (2026-08-29).** `documentation.contracts_root` was removed from the
> configuration model: CompassRose reads its own contracts from where it is installed, so a project
> has nothing to declare and Doctor has nothing to verify inside the repository. The two criteria
> above stand for the remaining fields. The question behind the removed check — are the contracts
> this run will use actually readable? — is now Doctor's `contracts` check, over the installation.
> The criteria are left as written rather than edited: they were satisfied when this feature closed,
> and rewriting them would erase why the check existed.
- Doctor reports whether the normalized current platform is listed in `project.supported_platforms`.
- Doctor reports whether the current directory is inside a Git repository.
- Doctor treats each required command key as valid when its value is either an empty string or a non-empty shell command string, and invalid when the key is missing or the value has an invalid type.
- A fully valid repository produces the documented human-readable success shape, including `CompassRose Doctor` and `Status: OK`.
- A failed check produces a non-OK overall status and diagnostics that identify the failed check and the relevant path or field when available.
- The command does not invoke AI tools, external AI adapters, or any configured quality-gate command.
- The command does not modify project-local files or Git metadata.

## Implementation Deliverables

- A feature-owned Doctor diagnostic model and read-only check coordinator.
- Read-only checks for the configuration, required documentation, platform, Git context, and configured-command contract.
- CLI registration and human-readable rendering for `compassrose doctor`, including an overall success/failure status.
- Automated tests covering valid and invalid repository conditions, command-value semantics, path containment, platform normalization, Git detection, output, and read-only/no-external-execution behavior.

## Completion Criteria

This feature is considered implemented when:

- All acceptance criteria are satisfied against the current repository and the Doctor MVP contract in `docs/compassrose/CONFIG.md`.
- The command is deterministic and read-only across the supported Linux and Windows runtime expectations.
- Required checks are independently diagnosable and a failing check does not prevent the report from identifying the other applicable failures.
- Automated tests and the repository's required quality gates pass.
- No implementation changes are made to the configuration model, AI adapters, workflow orchestration, or broader Git integration.

## Implementation Outline

This section lists the feature's pre-declared task requests: fixed, locked-in boundaries
decided once at formalization time. Each is elaborated into an executable task in turn —
see `state.md`'s `## Outline Progress` for current status.

### 1. Doctor diagnostic contract

Establish the feature-owned, structured diagnostic boundary for compassrose doctor, including per-check results, an overall readiness result, and a read-only check context that consumes the completed configuration model without changing it.

Allowed:
- `src/doctor/`
- `tests/doctor/`

Forbidden:
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `docs/compassrose/`
- `docs/features/`

### 2. Repository readiness checks

Implement the Doctor MVP checks for configuration discovery and parsing, required project and documentation fields, required documentation paths, supported-platform membership, Git-repository membership, and the required command-key empty-or-non-empty string semantics, without executing commands or AI tools.

Allowed:
- `src/doctor/`
- `tests/doctor/`

Forbidden:
- `src/cli/`
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `docs/compassrose/`
- `docs/features/`

### 3. CLI reporting and command integration

Expose compassrose doctor through the CLI and render clear human-readable per-check diagnostics with a final success or failure status while preserving the feature's read-only and no-AI guarantees.

Allowed:
- `src/cli/`
- `src/doctor/`
- `tests/cli/`
- `tests/doctor/`

Forbidden:
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `docs/compassrose/`
- `docs/features/`

## Related Documents

- `request.md`
- `architecture.md`
- `state.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/planner/feature-scope-guard.md`
