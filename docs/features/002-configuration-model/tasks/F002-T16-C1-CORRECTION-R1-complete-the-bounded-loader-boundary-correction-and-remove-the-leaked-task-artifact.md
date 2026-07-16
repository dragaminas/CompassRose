# Task F002-T16-C1-CORRECTION-R1: Complete the bounded loader-boundary correction and remove the leaked task artifact

## Task ID
`F002-T16-C1-CORRECTION-R1`

## Parent Task
`F002-T16-C1`

## Parent Feature
`002-configuration-model`

## Goal
Delete the generated F002-T17 task artifact, reduce src/cli/main.ts to removal of only the F002-T16 fallback hunk, and add executable evidence that omitted MVP fields remain compatible with existing typed callers while canonical policy, adapter, and platform values remain exposed.

## First Executable Step
Delete docs/features/002-configuration-model/tasks/017-revert-f002-t16-cli-scope-fallback-hunk-correct-loader-normalization.md, remove the added missing-git_policy guard from src/cli/main.ts while retaining only the fallback-hunk removal, and run npm run typecheck.

## Minimum Progress Evidence
- The reviewable diff contains no generated F002-T17 task artifact and no path outside this correction task's allowed paths.
- The src/cli/main.ts diff contains only removal of the F002-T16 git_policy fallback hunk; it adds no new stderr, return, default, or preflight behavior.
- tests/configReader.test.ts contains executable coverage for a minimal configuration omitting optional policy and adapter fields, with the result remaining usable by the existing typed caller.
- tests/configReader.test.ts contains an executable canonical-configuration assertion confirming the existing top-level platform value remains exposed.
- The optional adapter diagnostics and non-object policy-section diagnostics remain covered, and all four required quality gates pass.

## Review Findings
- Remove the out-of-scope generated task artifact at docs/features/002-configuration-model/tasks/017-revert-f002-t16-cli-scope-fallback-hunk-correct-loader-normalization.md.
- Remove the new missing-git_policy branch from src/cli/main.ts; preserve caller-facing compatibility through the existing readProjectConfiguration()/ProjectConfiguration mechanisms in src/config/configReader.ts and src/config/configTypes.ts.
- Add executable assertions in tests/configReader.test.ts for minimal-config caller compatibility and preservation of the canonical top-level platform value.

## Scope
Allowed:
- `src/cli/main.ts`
- `src/config/configReader.ts`
- `src/config/configTypes.ts`
- `tests/configReader.test.ts`
- `docs/features/002-configuration-model/tasks/017-revert-f002-t16-cli-scope-fallback-hunk-correct-loader-normalization.md (delete only)`

Forbidden:
- `src/doctor/`
- `src/orchestrator/`
- `tests/doctorCommand.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/tasks/016.1-constrain-mvp-loader-normalization-to-the-configuration-boundary.md`
- `provider-specific adapters`
- `external-tool global configuration`
- `planner invocation, feature selection, lifecycle transitions, or other orchestration behavior`
- `any path not listed in allowed_paths`

## Constraints
- Keep src/cli/main.ts limited to removing the identified fallback hunk; do not add CLI behavior.
- Keep omitted future-facing policy sections and omitted non-required external_cli fields valid through the existing configuration loader/types.
- Validate present optional adapter fields and present optional policy sections using the existing configuration diagnostics mechanism.
- Preserve the existing canonical policy, adapter, command, project, and top-level platform values without changing Doctor or orchestration scope.
- Do not create or modify any additional task, state, project, configuration, doctor, orchestrator, provider, or external-tool files.

## Acceptance Criteria
- The generated F002-T17 task artifact is absent from the reviewable diff.
- src/cli/main.ts contains no new missing-git_policy branch and only removes the F002-T16 fallback hunk.
- A minimal MVP configuration is accepted by readProjectConfiguration() and remains compatible with the existing typed caller without a CLI fallback.
- Malformed present optional adapter fields and non-object optional policy sections return configuration diagnostics rather than silent defaults or exceptions.
- The canonical configuration result exposes its existing policy, adapter, and top-level platform values, with executable assertions in tests/configReader.test.ts.
- The focused configuration and Doctor tests, typecheck, full test suite, and diff whitespace check pass.

## Quality Gates to Run
```bash
npx vitest run tests/configReader.test.ts tests/doctorCommand.test.ts
npm run typecheck
npm test
git diff --check
```
