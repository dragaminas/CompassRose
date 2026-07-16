# Task F002-T16-C1-CORRECTION-R1-CORRECTION-1: Strengthen the canonical platform preservation assertion

## Task ID
`F002-T16-C1-CORRECTION-R1-CORRECTION-1`

## Parent Task
`F002-T16-C1-CORRECTION-R1`

## Parent Feature
`002-configuration-model`

## Goal
Update the existing canonical-configuration test to assert the exact project.supported_platforms values documented in docs/compassrose/CONFIG.md, without changing production code or expanding scope.

## First Executable Step
In tests/configReader.test.ts, replace the non-empty platform checks in the canonical-configuration test with an exact assertion for ['linux', 'windows'], then run npx vitest run tests/configReader.test.ts tests/doctorCommand.test.ts.

## Minimum Progress Evidence
- The reviewable diff changes only tests/configReader.test.ts and contains an exact assertion that result.value.project.supported_platforms equals ['linux', 'windows'].

## Review Findings
- The current canonical platform test verifies only that the value is a non-empty array, not that the configured canonical platform values are preserved.

## Scope
Allowed:
- `tests/configReader.test.ts`

Forbidden:
- `src/cli/main.ts`
- `src/config/configReader.ts`
- `src/config/configTypes.ts`
- `docs/features/002-configuration-model/tasks/017-revert-f002-t16-cli-scope-fallback-hunk-correct-loader-normalization.md`
- `src/doctor/`
- `src/orchestrator/`
- `tests/doctorCommand.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `any path not listed in allowed_paths`

## Constraints
- Change only the existing canonical platform assertion in tests/configReader.test.ts.
- Use the existing canonical values linux and windows documented in docs/compassrose/CONFIG.md.
- Do not modify production code, task artifacts, configuration documents, Doctor, orchestrator, provider, or external-tool files.
- Retain the existing optional adapter and policy diagnostics coverage.

## Acceptance Criteria
- The canonical-configuration test asserts result.value.project.supported_platforms equals ['linux', 'windows'].
- The correction diff contains no path other than tests/configReader.test.ts.
- The focused configuration and Doctor tests, typecheck, full test suite, and diff whitespace check pass.

## Quality Gates to Run
```bash
npx vitest run tests/configReader.test.ts tests/doctorCommand.test.ts
npm run typecheck
npm test
git diff --check
```
