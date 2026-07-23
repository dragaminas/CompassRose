# State: Doctor Command

## Lifecycle State

unblock_pending

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F003-T01
- active_correction_task: none
- active_unblock_task: F003-DR01
- last_implementation_result: passed
- last_quality_gate_result: failed
- last_review_result: blocked
- last_unblock_result: not_run
- doctor_recovery_attempts: 1
- blocked_on_fix: none

## Current Reality

- `docs/features/003-doctor-command/request.md` is the human-authored request being formalized.
- `docs/compassrose/CONFIG.md` contains the canonical project-level configuration example, the Doctor MVP configuration contract, command-presence semantics, and the expected successful Doctor output shape.
- Feature `002-configuration-model` is recorded as complete and provides repository-local configuration loading/validation plus Doctor/runtime integration.
- `docs/compassrose/PROJECT_STATE.md` records an existing dedicated runtime preflight check for the configured project-state document, but it does not establish that the full `compassrose doctor` readiness command is complete.
- No feature-specific implementation deliverable for the complete Doctor command is claimed complete by this feature state.

Task `F003-T01` is now planned and ready to execute. Establish Doctor diagnostic contract and read-only check context.

## Implemented Deliverables

- The canonical feature documentation set is formalized for this feature.
- The repository-local configuration contract and its Doctor MVP rules already exist as shared project inputs.
- A project-state preflight behavior is already recorded as part of feature `002-configuration-model`; it is treated as a reusable prerequisite or partial existing behavior, not re-owned here.

## Remaining Deliverables

- Define the feature-owned structured diagnostic boundary for Doctor.
- Implement the read-only MVP readiness checks for configuration, required documentation, platform, Git repository membership, and configured-command semantics.
- Expose the checks through `compassrose doctor` with clear human-readable output and an overall readiness result.
- Add automated coverage for passing and failing checks, cross-platform behavior, path containment, output, and read-only/no-external-execution guarantees.

## Outline Progress

- 1. Doctor diagnostic contract: in progress
- 2. Repository readiness checks: not started
- 3. CLI reporting and command integration: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: `implementation_running`
- active_task: `F003-T01`
- active_correction_task: `none`
- active_unblock_task: `none`

## Last Approved Change

Fix `003-pre-existing-failure-in-docs-features-003-doctor-command-state-md` reached completed; resumed automatically.

## Known Gaps

- The supplied planning sources do not identify the current CLI entrypoint or the physical configuration-loader path, so those bindings remain for task planning.
- The existing project-state preflight may need to be reused or folded into the Doctor diagnostic report without duplicating configuration or runtime policy.
- The full readiness command, its complete check set, and its automated coverage remain unimplemented by this feature.

## Next Planning Hint

Execute doctor recovery task `F003-DR01` next.
