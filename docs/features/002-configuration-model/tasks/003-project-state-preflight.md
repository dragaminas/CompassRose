# Task 003: Add Project State Preflight

## Task ID
`F002-T03`

## Parent Feature
`002-configuration-model`

## Goal
Teach CompassRose to inspect `docs/compassrose/PROJECT_STATE.md` as a distinct runtime preflight step and surface that check through `compassrose doctor`.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: `compassrose doctor` validates project configuration and path existence, but it does not yet inspect the repository's project-state document as a structured runtime input.

## Context
- `src/contracts/runtime/operation-loop.md` requires the runtime to inspect project state after preconditions and before feature inventory.
- `docs/compassrose/PROJECT_STATE.md` already exists and records current repository reality.
- `src/doctor/doctorCommand.ts` is the first runtime consumer of repository-local policy and already reads `docs/compassrose/CONFIG.md`.
- `docs/DMS.md` says `PROJECT_STATE.md` must describe reality, not intention.

## Scope
Allowed:
- `src/doctor/`
- `tests/`

Forbidden:
- `docs/`
- `src/cli/`
- `src/config/`
- `src/contracts/`
- `src/filesystem/`
- `src/git/`
- `src/platform/`
- `src/shared/`
- `package.json`
- `package-lock.json`

## Out of Scope
- Feature selection or task generation
- Inventorying `docs/features/`
- Implementing the broader runtime loop
- Modifying `docs/compassrose/PROJECT_STATE.md`
- Provider-specific adapters
- Global tool configuration changes

## Constraints
- Keep the project-state logic deterministic and repository-local.
- Use the configured `documentation.project_state` path rather than hardcoding `docs/compassrose/PROJECT_STATE.md`.
- Fail clearly when the project-state file is missing or does not match the expected CompassRose state-document shape.
- Do not add feature inventory or lifecycle transitions yet.

## Development Policy
- `strict_tdd`

## Expected Changes
- Add a small helper under `src/doctor/` that reads and validates the project-state document.
- Extend `compassrose doctor` to emit a dedicated project-state check after configuration and path validation.
- Add tests for the happy path and at least one failure path for missing or malformed project state.

## Expected Deliverables
- `code`
- `tests`

## Acceptance Criteria
- `npm run doctor` still passes on the current repository.
- `compassrose doctor` reports a separate project-state inspection result.
- Missing or malformed `docs/compassrose/PROJECT_STATE.md` produces a clear failure.
- The implementation uses the configured project-state path from `CONFIG.md`.
- The task does not invent feature inventory or selection logic.

## Files Likely Affected
- `src/doctor/doctorCommand.ts`
- `src/doctor/projectState.ts`
- `tests/doctorCommand.test.ts`
- `tests/projectState.test.ts`

## Quality Gates to Run
```bash
npm test
npm run typecheck
npm run build
npm run doctor
git diff --check
```

## Review Notes
- The reviewer should reject any implementation that turns this into feature selection, task generation, or a new orchestration subsystem.
- The reviewer should confirm that the project-state check remains a preflight step, not a replacement for the operation loop.

## Completion Criteria
- `compassrose doctor` can inspect project state as a distinct preflight step and report failures clearly without expanding into feature inventory.
