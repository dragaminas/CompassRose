# State: Doctor Command

## Lifecycle State

completed

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: approved
- last_unblock_result: not_run
- doctor_recovery_attempts: 0
- blocked_on_fix: none
- validation: confirmed

## Current Reality

`compassrose doctor` is implemented and satisfies this feature's request and every acceptance
criterion. It validates the Git repository, parses and validates `compassrose/CONFIG.md` against the
Doctor MVP contract, checks the platform against `project.supported_platforms`, verifies that every
required documentation path resolves inside the repository, validates the configured project-state
document, and reports blocked work items as informational cards. It calls no AI adapter, runs no
configured quality-gate command, and modifies no file.

The implementation lives in `src/doctor/doctorDiagnostics.ts` (the feature-owned structured
diagnostic boundary), `src/doctor/doctorCommand.ts` (checks and human-readable reporting),
`src/doctor/projectState.ts` (the project-state check), and is reached through
`src/cli/main.ts`'s `doctor` subcommand. Coverage lives in `tests/doctorCommand.test.ts` and
`tests/doctor/`.

This feature spent an extended period recorded as `blocked` while being, in substance, complete. The
recorded blocker was `Doctor recovery iteration limit reached ... after 3 attempt(s)` — a limit in
the recovery machinery, not a gap in the Doctor command. Nine doctor-recovery tasks
(`F003-DR01` through `F003-DR09`) ran against it without resolving anything, which is the concrete
evidence that motivated feature `026-conversational-doctor-recovery` to remove that pipeline
entirely.

The one acceptance criterion genuinely unmet at closing time was the documented success shape: the
specification requires the report to begin `CompassRose Doctor` and to state `Status: OK`, while the
implementation emitted `CompassRose doctor` and `Result: PASS`. The implementation was corrected to
match the specification, since the specification is the authority on the documented output shape.

Closed by hand during the specification round of 2026-08-22, after verifying all thirteen acceptance
criteria against the running command. No runtime path yet transitions an item to `completed`;
`025-automated-development-loop` adds one.

## Implemented Deliverables

- the feature-owned structured diagnostic boundary for Doctor (`src/doctor/doctorDiagnostics.ts`)
- read-only MVP readiness checks for configuration, required documentation paths, platform, Git repository membership, and configured-command semantics
- `compassrose doctor` exposing those checks with human-readable output and an overall readiness result
- the project-state document check as a distinct diagnostic
- blocked-work reporting through the shared blocker card renderer
- automated coverage for passing and failing checks, path containment, output shape, and the read-only guarantee

## Remaining Deliverables

- None

## Outline Progress

- 1. Doctor diagnostic contract: complete
- 2. Repository readiness checks: complete
- 3. CLI reporting and command integration: complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

The documented success shape was corrected to `CompassRose Doctor` / `Status: OK`, satisfying the
final outstanding acceptance criterion, and the feature was closed.

## Known Gaps

- This repository's own e2e suite clones the current `HEAD`, so while any feature sits in a
  non-terminal lifecycle state those tests can pick up the in-progress state and fail in ways their
  scripted mock CLI responses do not anticipate. This feature's own blocked state was a standing
  cause of that; closing it removes this instance, but the underlying fragility in the e2e harness
  remains and belongs to `025-automated-development-loop`'s quality-gate work.

## Next Planning Hint

Feature `003-doctor-command` is complete. The next work is the specification round's own output:
`023-terminal-session` through `028-project-understanding`.
