# Task 002: Implement Project Configuration Loading and Doctor Validation

## Task ID
`F002-T02`

## Parent Feature
`002-configuration-model`

## Goal
Implement the first runtime consumer of the project-local configuration by reading `docs/compassrose/CONFIG.md`, validating the MVP Doctor contract, and exposing that validation through `compassrose doctor`.

## Trace
- Roadmap objective: Foundation
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: `src/config/`, `src/doctor/`, and `src/cli/main.ts` are empty, so the repository cannot yet parse or enforce the MVP Doctor contract.

## Context
- `docs/compassrose/CONFIG.md` is the canonical project-level configuration document and already defines the minimum Doctor contract.
- `src/contracts/runtime/operation-loop.md` requires configuration precondition checks before feature selection.
- The current repository has no implementation for config loading, doctor validation, or CLI command dispatch.

## Scope
Allowed:
- `src/cli/main.ts`
- `src/config/`
- `src/doctor/`
- `src/filesystem/`
- `src/git/`
- `src/shared/`
- `tests/`

Forbidden:
- `docs/`
- `package.json`
- `package-lock.json`
- `src/contracts/`
- `src/platform/`

## Out of Scope
- Provider-specific adapters
- Global provider or model configuration
- Task-, feature-, or user-level configuration precedence
- Executing configured shell commands
- Orchestration beyond the `doctor` validation path
- Repository-wide refactors unrelated to configuration loading or doctor validation

## Constraints
- Keep the implementation project-local and provider-agnostic.
- Validate only the MVP project scope documented in `docs/compassrose/CONFIG.md`.
- Treat missing command keys as invalid and present empty strings as intentionally unconfigured.
- Validate repository-local path existence and git-repository presence clearly.
- Do not add new dependencies or mutate global external-tool settings.
- `compassrose doctor` must report validation failures clearly and exit non-zero.

## Development Policy
- `strict_tdd`

## Expected Changes
- Add configuration types and a loader for the Markdown YAML block in `docs/compassrose/CONFIG.md`.
- Add Doctor validation for the MVP contract, required paths, git-repository presence, and supported platform checks.
- Wire the `doctor` subcommand through `src/cli/main.ts`.
- Add tests covering the happy path and at least one missing-field or missing-path failure.

## Expected Deliverables
- `code`
- `tests`

## Acceptance Criteria
- `npm run doctor` succeeds on the current repository and prints a clear summary of the required checks.
- The CLI exits non-zero on invalid or missing configuration.
- The loader validates the required `project`, `adapters`, `commands`, and `documentation` sections and the documented required fields.
- The implementation does not execute `commands.*` values and does not touch global configuration.
- Tests cover at least one success path and at least one failure path.

## Files Likely Affected
- `src/cli/main.ts`
- `src/config/configReader.ts`
- `src/config/configTypes.ts`
- `src/doctor/doctorCommand.ts`
- `src/filesystem/pathResolver.ts`
- `src/git/gitStatus.ts`
- `src/shared/result.ts`
- `tests/`

## Quality Gates to Run
```bash
npm test
npm run typecheck
npm run build
npm run doctor
git diff --check
```

## Review Notes
- The reviewer should reject any hidden provider-specific assumptions, global-config mutation, or execution of the configured commands.
- The reviewer should confirm that validation matches `docs/compassrose/CONFIG.md` rather than inventing a second schema.

## Completion Criteria
- `compassrose doctor` is the first working runtime command for the project-local configuration contract and can be used as the base for later orchestration work.
