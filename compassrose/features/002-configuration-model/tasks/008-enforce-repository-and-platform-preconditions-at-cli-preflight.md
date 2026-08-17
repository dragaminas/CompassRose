# Task 008: Enforce repository and platform preconditions at CLI preflight

## Task ID
`F002-T08`

## Parent Feature
`002-configuration-model`

## Goal
Make the zero-argument CLI entrypoint enforce the operation-loop prerequisites for being inside a Git repository and running on a platform listed by project.supported_platforms before reporting a successful no-task preflight.

## First Executable Step
Add a failing test in tests/main.test.ts that invokes main([]) from a temporary workspace without a Git repository and asserts exit code 1 with a runtime-preflight repository diagnostic.

## Minimum Progress Evidence
- tests/main.test.ts contains coverage for invocation outside a Git repository and for a configured platform that excludes the current platform.
- src/cli/main.ts contains the corresponding runtime-preflight enforcement before the no-task success message.
- npx vitest run tests/main.test.ts passes while preserving valid external_cli wiring and existing CLI regressions.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The broader runtime loop still needs a concrete orchestration entrypoint that consumes validated project policy and repository facts; the current CLI preflight does not yet enforce repository or supported-platform prerequisites.

## Context
- The feature lifecycle is formalized with no active correction or unblock task. F002-T07-C2 is recorded as approved, and the current config loader/tests already enforce the verified MVP rule that enabled roles use only the generic external_cli adapter. The next bounded gap is completing CLI runtime preconditions required by the operation-loop contract.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `src/config/configReader.ts`
- `src/config/configTypes.ts`
- `src/doctor/`
- `docs/`
- `proto/`
- `tests/testUtils.ts`
- `all other repository paths`

## Constraints
- Keep the task limited to deterministic repository and supported-platform preflight checks at the CLI entrypoint.
- Use the existing project.supported_platforms configuration and repository/platform facts; do not invent new configuration fields or contract states.
- Stop before task selection or adapter invocation when a precondition fails.
- Preserve the existing generic external_cli-only role-wiring behavior and valid no-task success path.
- Do not add provider-specific adapters or modify global tool configuration.
- Do not modify documentation, feature state, project state, doctor behavior, or unrelated tests.

## Development Policy
- `test_guided`

## Acceptance Criteria
- main([]) invoked outside a Git repository returns exit code 1, emits a field-specific runtime-preflight repository diagnostic, and does not emit the no-task success message.
- main([]) returns exit code 1 when the current supported platform is absent from project.supported_platforms, with a runtime-preflight platform diagnostic.
- A valid canonical configuration invoked inside a repository still returns exit code 0 with the existing no-task preflight message and no stderr output.
- Existing role-to-adapter coverage remains intact: a defined non-external adapter is rejected and valid external_cli wiring passes.
- The doctor command routing regression remains passing.

## Files Likely Affected
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/runtime/operation-loop.md`
- `src/cli/main.ts`
- `src/config/configReader.ts`
- `src/doctor/doctorCommand.ts`
- `tests/main.test.ts`

## Quality Gates to Run
```bash
npm run typecheck
npx vitest run tests/main.test.ts
npm test
git diff --check -- src/cli/main.ts tests/main.test.ts
```

## Expected Deliverables
- `code`
- `tests`
