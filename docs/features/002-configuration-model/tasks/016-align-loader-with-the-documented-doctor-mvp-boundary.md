# Task 016: Align loader with the documented Doctor MVP boundary

## Task ID
`F002-T16`

## Parent Feature
`002-configuration-model`

## Goal
Make project configuration validation accept the documented minimum Doctor MVP contract without requiring future-facing policy sections or non-required adapter fields, while preserving the existing typed behavior for the complete canonical configuration.

## First Executable Step
Add a failing minimal-MVP configuration case to tests/configReader.test.ts containing only the required project, adapters.external_cli.type, command, and documentation fields.

## Minimum Progress Evidence
- tests/configReader.test.ts contains an observable test for a minimal MVP configuration with omitted future-facing sections and adapter fields.
- tests/doctorCommand.test.ts verifies the minimal configuration reaches a passing configuration check when its required repository paths exist.
- src/config/configReader.ts and, if required to preserve its typed result, src/config/configTypes.ts implement the documented boundary rather than only changing tests.
- The focused configuration and Doctor tests pass after the source change.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as its project-level runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The feature state records the configuration flow as implemented, but the loader currently requires execution, roles, git_policy, development_policy, review_policy, quality_gates, limits, and all external_cli fields even though CONFIG.md defines only project, adapters.external_cli.type, four command keys, and four documentation fields as required for the Doctor MVP; this minimum contract is not covered by tests.

## Context
- F002-T15 is recorded as approved and the feature is back at a planning checkpoint. The F002-T10 through F002-T14 orchestration work, including the advisory F002-T14 planner-invocation lesson, is explicitly superseded and must not be revived here. The current in-scope gap is the documented minimum configuration-validation boundary.

## Scope
Allowed:
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `tests/configReader.test.ts`
- `tests/doctorCommand.test.ts`

Forbidden:
- `src/cli/main.ts`
- `src/orchestrator/`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `task artifacts outside the allowed test and configuration files`
- `provider-specific adapters`
- `external-tool global configuration`
- `planner invocation, feature selection, lifecycle transitions, or other orchestration behavior`

## Constraints
- Use the required MVP fields exactly as documented in docs/compassrose/CONFIG.md: project.name, project.supported_platforms, project.documentation_root, adapters.external_cli.type, commands.typecheck, commands.tests, commands.lint, commands.build, documentation.roadmap, documentation.project_state, documentation.config, and documentation.contracts_root.
- A missing required command key remains invalid, while a present empty command string remains valid and intentionally unconfigured.
- A missing or invalid adapters.external_cli.type remains invalid; do not require command, args, stdin, input_file_argument, or output_file for the Doctor MVP contract.
- Omitted future-facing policy sections must not make an otherwise valid MVP configuration fail configuration validation, and existing callers must continue receiving a deterministic typed result without provider-specific behavior.
- Preserve successful loading and typed values for the complete canonical docs/compassrose/CONFIG.md configuration.
- Do not execute configured commands, rewrite commands, select interpreters, invoke external tools, or modify global tool settings.
- Keep the change limited to configuration validation and its focused tests; do not repair the known correction-task allocator gap or superseded F002-T14 behavior.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A valid Markdown configuration containing only the documented Doctor MVP sections and required fields is accepted by readProjectConfiguration() and reaches a successful configuration check in runDoctor() when the configured repository paths and current platform are valid.
- The Doctor MVP does not require execution, roles, git_policy, development_policy, review_policy, quality_gates, limits, or non-required external_cli fields.
- Missing required MVP sections or fields, including any required command key, still produces configuration diagnostics and a non-zero Doctor result.
- Present empty strings for commands.typecheck, commands.tests, commands.lint, or commands.build remain valid and are not executed by Doctor.
- The complete canonical configuration continues to expose its existing typed policy and adapter values unchanged.
- The implementation does not add provider-specific behavior, command rewriting, external invocation, or global configuration mutation.

## Files Likely Affected
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `src/doctor/doctorCommand.ts`
- `tests/configReader.test.ts`
- `tests/doctorCommand.test.ts`

## Quality Gates to Run
```bash
npx vitest run tests/configReader.test.ts tests/doctorCommand.test.ts
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
