# Task 005: Add configuration-backed runtime preflight to the default CLI entrypoint

## Task ID
`F002-T05`

## Parent Feature
`002-configuration-model`

## Goal
Make the default CompassRose CLI path load docs/compassrose/CONFIG.md and validate the current MVP runtime preconditions from execution, roles, and git_policy before any future orchestration step.

## First Executable Step
Create tests/main.test.ts with a failing case for main([]) when roles.planner.enabled is false in the fixture CONFIG.md workspace.

## Minimum Progress Evidence
- tests/main.test.ts exists with coverage for main([]) runtime-preflight success and failure paths.
- src/cli/main.ts no longer falls straight to usage output for main([]) and instead routes through a configuration-backed runtime preflight.
- src/config/ contains a structured runtime-precondition validator that turns unsupported execution, roles, and git_policy values into diagnostics consumed by the CLI.

## Trace
- Roadmap objective: Use repository-local configuration as the deterministic source of runtime policy.
- Feature goal: CompassRose can read, validate, and use docs/compassrose/CONFIG.md as the project-level source of runtime policy.
- State gap: The project-local configuration flow still needs a runtime consumer that uses the validated execution, roles, and git_policy data during orchestration.

## Context
- The typed configuration loader already validates and exposes execution, roles, and git_policy, and compassrose doctor already proves repository/config/project-state preflight behavior. The remaining feature-local gap is that the default CLI runtime path still does not consume those validated policy fields before broader orchestration work begins.

## Scope
Allowed:
- `src/cli/main.ts`
- `src/config/`
- `src/doctor/doctorCommand.ts`
- `tests/`

Forbidden:
- `docs/`
- `src/contracts/`
- `src/doctor/ (other than src/doctor/doctorCommand.ts)`
- `src/cli/ (other than src/cli/main.ts)`

## Constraints
- Use the existing typed configuration loader instead of reparsing CONFIG.md or duplicating its schema rules.
- Keep this task at runtime-preflight depth only; do not implement feature inventory, task planning, task execution, review, or state persistence.
- Treat only the project-level configuration in docs/compassrose/CONFIG.md as supported input for this task; do not add Task, Feature, or User override handling.
- Reject unsupported MVP runtime combinations using the documented execution, roles, and git_policy assumptions rather than silently ignoring them.
- Preserve current doctor behavior and keep provider-specific adapters or global tool mutation out of scope.

## Development Policy
- `test_guided`

## Acceptance Criteria
- main([]) loads the canonical project configuration from the repository root and evaluates runtime-precondition compatibility using the typed execution, roles, and git_policy data before any orchestration step.
- Unsupported runtime-precondition values produce a non-zero CLI result with field-specific diagnostics, with tests covering at least one execution-policy failure, one role configuration failure, and one git-policy failure.
- When the configuration is compatible with the current MVP runtime contract, main([]) exits cleanly after a clear preflight-only message and does not select features, generate tasks, or run implementation.
- main(['doctor']) continues to behave as it does today, with regression coverage proving the doctor path still passes and fails in the existing scenarios.

## Files Likely Affected
- `src/cli/main.ts`
- `src/config/configReader.ts`
- `src/config/configTypes.ts`
- `src/doctor/doctorCommand.ts`
- `src/contracts/runtime/operation-loop.md`
- `docs/compassrose/CONFIG.md`
- `tests/testUtils.ts`
- `tests/doctorCommand.test.ts`

## Quality Gates to Run
```bash
npm run typecheck
npm test
```

## Expected Deliverables
- `code`
- `tests`
