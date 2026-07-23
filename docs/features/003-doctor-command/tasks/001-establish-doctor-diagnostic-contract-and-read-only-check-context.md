# Task 001: Establish Doctor diagnostic contract and read-only check context

## Task ID
`F003-T01`

## Parent Feature
`003-doctor-command`

## Goal
Establish a feature-owned, structured diagnostic boundary for compassrose doctor with readonly per-check results, a derived overall readiness result, and a readonly check context that consumes the existing normalized configuration model without mutating or reparsing it.

## First Executable Step
Create tests/doctor/doctorDiagnostics.test.ts with failing tests for constructing the check context from a normalized configuration object and deriving readiness from ordered pass/fail check results.

## Minimum Progress Evidence
- A new or updated test file exists under tests/doctor/ and covers context construction plus pass/fail readiness aggregation.
- A source diff exists under src/doctor/ defining the diagnostic boundary and wiring doctorCommand.ts to use it.
- Tests verify that the supplied normalized configuration remains unchanged after context construction and report creation.

## Trace
- Roadmap objective: Provide a deterministic repository-local preflight boundary before workflow execution.
- Feature goal: Make repository readiness observable before workflow execution.
- State gap: Feature 003 is formalized and task request 1 is not started; the current doctor coordinator constructs checks and reports inline, has no feature-owned check context, and tests/doctor/ has no coverage.

## Context
- The existing doctor coordinator performs partial checks, accumulates DoctorCheck results, and builds a DoctorReport, but the feature has not yet established its own diagnostic boundary. The completed configuration model must be passed into a read-only context after successful loading; configuration parsing, readiness checks, and CLI expansion remain outside this task.

## Scope
Allowed:
- `src/doctor/`
- `tests/doctor/`

Forbidden:
- `src/config/`
- `src/orchestrator/`
- `src/adapters/`
- `src/roles/`
- `src/git/`
- `docs/compassrose/`
- `docs/features/`

## Constraints
- Implement only task request 1, not the later repository-readiness-check or CLI-integration requests.
- Add a feature-owned diagnostic module under src/doctor/ that exposes a readonly DoctorCheckContext and pure report aggregation over the existing per-check and overall report shapes.
- Construct the context from the existing successfully normalized configuration value and runtime facts; do not add a second parser, validator, configuration model, or mutation path.
- Preserve per-check name, status, details, and ordering; derive the overall success/readiness and exit code deterministically from the check statuses.
- Do not add filesystem, Git, platform, command execution, AI, or external-adapter behavior beyond wiring the existing coordinator through the new boundary.
- Do not modify files outside the allowed paths.

## Development Policy
- `test_guided`

## Acceptance Criteria
- src/doctor/doctorDiagnostics.ts defines the feature-owned readonly check context and structured diagnostic/report boundary, using the existing normalized configuration model as an input rather than redefining it.
- doctorCommand.ts constructs the context only after successful configuration loading and delegates overall report construction to the boundary without changing the configuration object.
- The report preserves every supplied per-check result in order and reports success with exit code 0 only when every check passes; any failed check produces an unsuccessful report with exit code 1.
- Automated tests under tests/doctor/ cover a valid context, preservation of runtime/configuration inputs, non-mutation of the supplied configuration, all-pass aggregation, and failed-check aggregation.
- The task makes no changes to configuration, orchestration, adapter, role, Git, project documentation, or feature documentation paths, and does not implement the later readiness-check or CLI work.

## Files Likely Affected
- `src/doctor/doctorCommand.ts`
- `src/doctor/projectState.ts`
- `tests/doctor/`

## Quality Gates to Run
```bash
npm run typecheck
npm test
```

## Expected Deliverables
- `code`
- `tests`
