# Task F002-T07-C2: Enforce MVP external_cli-only role wiring

## Task ID
`F002-T07-C2`

## Task Lineage

- previous_task_id: `F002-T07`

## Parent Feature
`002-configuration-model`

## Goal
Correct runtime preflight so every enabled planner, implementer, and reviewer role must use the generic external_cli adapter, even when another adapter key is defined.

## First Executable Step
Add a failing regression test in tests/main.test.ts that defines a non-external adapter, points the enabled implementer role at it, and asserts exit code 1 with roles.implementer.adapter and runtime preflight diagnostics.

## Minimum Progress Evidence
- tests/main.test.ts contains a rejection case for an enabled role referencing a defined non-external adapter.
- tests/main.test.ts preserves rejection coverage for a missing adapter and successful continuation with external_cli.
- src/config/configReader.ts explicitly rejects enabled role adapters other than external_cli with a field-specific roles.<role>.adapter issue.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: Adapter-name existence alone is insufficient: the MVP supports only the generic external_cli adapter, so defined non-external adapters must not pass runtime preflight.

## Context
- CONFIG.md states that the MVP supports only one generic external_cli adapter and that provider-specific adapters are out of scope. The typed external_cli entry is already validated by the loader; this correction tightens role wiring at validateRuntimePreconditions() and proves the CLI preflight behavior.

## Scope
Allowed:
- `src/config/configReader.ts`
- `tests/main.test.ts`

Forbidden:
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/`
- `src/config/configTypes.ts`
- `src/cli/main.ts`
- `src/doctor/`
- `src/contracts/`
- `tests/configReader.test.ts`
- `tests/doctorCommand.test.ts`
- `tests/testUtils.ts`
- `proto/`

## Constraints
- Treat docs/compassrose/CONFIG.md as the project-level source of truth.
- An enabled role is valid only when its adapter is external_cli and the typed adapters.external_cli entry remains valid.
- Preserve field-specific missing-adapter diagnostics and valid external_cli no-task behavior.
- Do not add provider-specific adapter behavior or mutate global tool configuration.
- Keep all changes within the two allowed paths.

## Development Policy
- `test_guided`

## Acceptance Criteria
- An enabled planner, implementer, or reviewer using a defined adapter other than external_cli produces a roles.<role>.adapter runtime-preflight issue and main([], ...) returns exit code 1.
- An enabled role referencing a missing adapter continues to produce a field-specific roles.<role>.adapter runtime-preflight issue.
- The canonical configuration with enabled roles wired to external_cli continues to return exit code 0 with the existing successful no-task message and no stderr diagnostics.
- Focused tests explicitly cover missing-adapter rejection, defined non-external-adapter rejection, valid external_cli wiring, and existing CLI preflight regressions.
- No files outside src/config/configReader.ts and tests/main.test.ts are changed.

## Files Likely Affected
- `docs/compassrose/CONFIG.md`
- `src/config/configReader.ts`
- `src/cli/main.ts`
- `tests/main.test.ts`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts tests/configReader.test.ts
npm run typecheck
npm test
git diff --check -- src/config/configReader.ts tests/main.test.ts
```

## Expected Deliverables
- `code`
- `tests`
