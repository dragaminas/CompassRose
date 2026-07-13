# Task 007: Consume project runtime policy at the CLI entrypoint

## Task ID
`F002-T07`

## Parent Feature
`002-configuration-model`

## Goal
Add a deterministic runtime-policy gate so the no-argument CLI consumes the validated project configuration before task selection.

## First Executable Step
Add a failing test in tests/main.test.ts for invalid role-to-adapter wiring, asserting a field-specific runtime-preflight failure.

## Minimum Progress Evidence
- At least one source file under src/config/ or src/cli/main.ts and one test file under tests/ are changed.
- Tests demonstrate both valid policy continuation and invalid role/adapter policy rejection.
- No documentation, state, or global-tool configuration files are modified.

## Trace
- Roadmap objective: Make repository-local configuration effective runtime policy for CompassRose.
- Feature goal: Enable CompassRose to read, validate, and use project-level configuration without provider-specific or global-tool behavior.
- State gap: Typed execution, roles, and git_policy data are loaded, but the broader runtime still lacks a concrete policy consumer at the CLI orchestration boundary.

## Context
- Feature state is formalized with no active task, correction, or unblock task; F002-T06 is approved. Existing loader and CLI tests cover basic configuration validation, execution mode rejection, disabled roles, and conflicting git policy. The next bounded gap is runtime consumption of the validated policy. The advisory recovery lesson is not carried forward because its suggested handoff fields and artifacts are not defined by the supplied contracts.

## Scope
Allowed:
- `src/config/`
- `src/cli/main.ts`
- `tests/`

Forbidden:
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/`
- `src/contracts/`
- `src/doctor/`
- `provider-specific adapter code`
- `global external-tool configuration`
- `unrelated orchestration modules`

## Constraints
- Use only the project-level configuration supported by the MVP.
- Keep workflow control deterministic and preserve the operation-loop ordering.
- Consume the already parsed typed configuration; do not add ad hoc Markdown or YAML parsing in the CLI.
- Validate required role adapter wiring against the configured generic external CLI adapter.
- Preserve the existing valid no-task behavior.
- Do not implement the full task, implementation, quality-gate, or review loop.
- Do not modify project or feature state; runtime bookkeeping remains outside this implementation diff.
- Do not add unsupported handoff fields, artifacts, validators, or manifests based on the advisory recovery lesson.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The no-argument CLI passes the typed project configuration through a deterministic runtime-policy decision before any task-loop action.
- The policy decision enforces supported execution mode, enabled planner/implementer/reviewer roles, and valid role-to-adapter wiring for the MVP external CLI adapter.
- Existing git_policy compatibility validation remains enforced and produces field-specific runtime-preflight diagnostics with exit code 1 when invalid.
- A valid project configuration retains the existing successful no-task output and does not invoke an external adapter or mutate project/feature state.
- Focused tests cover valid continuation and invalid execution, role, adapter, and git-policy cases without duplicating loader-only assertions.
- The implementation remains limited to src/config/, src/cli/main.ts, and tests/.
- npm run typecheck and npm test pass before review.

## Files Likely Affected
- `src/config/configReader.ts`
- `src/config/configTypes.ts`
- `src/cli/main.ts`
- `tests/configReader.test.ts`
- `tests/main.test.ts`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/state.md`
- `docs/features/002-configuration-model/architecture.md`

## Quality Gates to Run
```bash
npm run typecheck
npm test
```

## Expected Deliverables
- `code`
- `tests`
