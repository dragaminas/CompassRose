# Task 015: Handle missing project configuration during runtime preflight

## Task ID
`F002-T15`

## Parent Feature
`002-configuration-model`

## Goal
Make the no-argument CLI report an absent canonical project configuration as a structured runtime-preflight failure instead of allowing an uncaught file-read error.

## First Executable Step
Edit tests/main.test.ts to add a test that invokes main([]) inside a Git workspace without docs/compassrose/CONFIG.md and asserts a non-zero result, a runtime-preflight diagnostic, no thrown exception, and no successful output.

## Minimum Progress Evidence
- tests/main.test.ts contains the missing-CONFIG.md regression test with non-zero, diagnostic, no-throw, and no-success-output assertions.
- src/cli/main.ts handles an absent docs/compassrose/CONFIG.md before configuration loading can throw, while preserving existing malformed-configuration diagnostics.
- The focused missing-configuration test passes after the source change.

## Trace
- Roadmap objective: Make CompassRose configuration explicit, validated, and usable as repository-local runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The runtime preflight calls readProjectConfiguration() without handling an absent canonical CONFIG.md, so missing project configuration is not reported as a structured configuration-validity failure.

## Context
- The configuration model, typed loader, Doctor checks, and CLI preflight already exist. The CLI resolves the canonical path docs/compassrose/CONFIG.md and reads it directly; unlike Doctor, it does not first handle the file being absent. The feature remains task_planning_pending, and the prior F002-T10 through F002-T14 orchestration-adjacent work is explicitly superseded by the real orchestrator, so this task stays focused on configuration validation at the existing runtime boundary.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `src/config/`
- `src/doctor/`
- `src/orchestrator/`
- `docs/`
- `src/contracts/`
- `tests/ other than tests/main.test.ts`

## Constraints
- Treat docs/compassrose/CONFIG.md as the canonical project-level configuration path.
- Return a non-zero runtime result and a diagnostic through stderr when the configuration file is absent.
- Do not modify the configuration schema or loader contract in this task.
- Preserve existing field-specific diagnostics for malformed configuration and existing successful preflight behavior.
- Do not invoke the orchestrator after the missing-configuration preflight failure.
- Do not add provider-specific adapter behavior or modify global tool configuration.
- Keep implementation and tests within the allowed paths.
- Do not implement the superseded task_planning_pending planner-dispatch behavior from the advisory recovery lesson.

## Development Policy
- `test_guided`

## Acceptance Criteria
- main([]) invoked inside a Git repository without docs/compassrose/CONFIG.md returns exit code 1 and does not throw.
- The missing-configuration failure emits a stderr diagnostic identifying runtime preflight and docs/compassrose/CONFIG.md.
- The missing-configuration failure emits no successful runtime/orchestrator output.
- Existing malformed-configuration and valid-configuration behavior remains covered and passing.
- Only src/cli/main.ts and tests/main.test.ts are changed.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `src/config/configReader.ts`
- `src/doctor/doctorCommand.ts`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts -t "missing project configuration"
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
