# Task 004: Validate Runtime-Precondition Policy Fields in the Project Config Loader

## Task ID
`F002-T04`

## Parent Feature
`002-configuration-model`

## Goal
Extend the repository-local configuration model so runtime orchestration can safely consume `execution`, `roles`, and `git_policy` from `docs/compassrose/CONFIG.md` instead of relying on raw, unvalidated YAML outside the Doctor MVP subset.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The project-local configuration flow still needs to be connected to the broader runtime orchestration loop.

## Context
- The repository already has a working Markdown-backed config loader and a Doctor preflight.
- The typed configuration surface still stops at the narrow Doctor MVP contract while `src/contracts/runtime/operation-loop.md` requires configuration-driven execution, role, and git-policy decisions before feature selection.
- `src/cli/main.ts` still exposes only `doctor`, so the smallest safe next step is to harden the loader around the first runtime-precondition fields rather than jumping straight into a broader runtime command.

## Scope
Allowed:
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `src/doctor/doctorCommand.ts`
- `tests/configReader.test.ts`
- `tests/doctorCommand.test.ts`

Forbidden:
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/`
- `src/cli/main.ts`
- `src/doctor/projectState.ts`
- `tests/projectState.test.ts`

## Out of Scope
- Feature selection
- Task planning
- Task execution
- Introducing a second configuration surface
- Provider-specific behavior
- Changes to the canonical configuration document

## Constraints
- Treat `docs/compassrose/CONFIG.md` as the only project-level source of truth; do not introduce a second configuration surface.
- Validate only the runtime-precondition sections needed for the first orchestration handoff; do not implement feature selection, task planning, or task execution in this task.
- Keep the implementation provider-independent and limited to repository-owned policy already documented in the canonical config.
- Preserve current Doctor behavior on the repository's existing canonical config while expanding the loader contract.

## Development Policy
- `implementation_first`

## Expected Changes
- Extend `ProjectConfiguration` in `src/config/configTypes.ts` with typed `execution`, `roles`, and `git_policy` sections that match the canonical keys already present in `docs/compassrose/CONFIG.md`.
- Update `readProjectConfiguration()` so it returns typed `execution`, `roles`, and `git_policy` data to callers and reports field-specific validation issues for invalid runtime-precondition values.
- Add config-loader test coverage for the new runtime-policy fields and keep the existing Doctor happy-path behavior intact.

## Expected Deliverables
- `code`
- `tests`

## Acceptance Criteria
- `readProjectConfiguration()` succeeds on the current canonical `docs/compassrose/CONFIG.md` and exposes typed `execution`, `roles`, and `git_policy` values to callers.
- The loader reports field-specific validation failures for unsupported `execution.mode` values, missing required role entries, and invalid `git_policy` enum or boolean fields.
- `runDoctor()` continues to pass on the happy-path fixture without requiring changes to the documented project config.

## Files Likely Affected
- `src/config/configTypes.ts`
- `src/config/configReader.ts`
- `src/doctor/doctorCommand.ts`
- `tests/configReader.test.ts`
- `tests/doctorCommand.test.ts`

## Quality Gates to Run
```bash
npm test
npm run typecheck
```

## Review Notes
- The reviewer should reject any change that broadens this task into feature selection, task planning, or task execution.
- The reviewer should confirm that the loader still treats `docs/compassrose/CONFIG.md` as the only project-level configuration source.
- The reviewer should confirm that Doctor's happy-path behavior remains intact after the loader contract expands.

## Completion Criteria
- The configuration loader validates and exposes the first runtime-precondition policy fields needed for broader orchestration work without expanding into the runtime loop itself.
