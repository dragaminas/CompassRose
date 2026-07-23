# State: Doctor Command

## Lifecycle State

blocked

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: F003-T01
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: blocked
- last_unblock_result: not_run
- doctor_recovery_attempts: 0
- blocked_on_fix: 002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts

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

- - kind: review_failure
- - signature: review-failure-implementation-running-task-f003-t01-hit-a-quality-gate-failure-npm-test-confirme
- - recoverability: agent
- - observed_state: lifecycle=implementation_running; active_task=F003-T01; active_correction_task=none; active_unblock_task=none
- - evidence: Task F003-T01 hit a quality-gate failure (`npm test`) confirmed unrelated to and preexisting its own scope; filed/reused fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` and stopped instead of continuing to review or generating a correction for it.
- - evidence: None
- - evidence: lifecycle=implementation_running
- - reason: Task F003-T01 hit a quality-gate failure (`npm test`) confirmed unrelated to and preexisting its own scope; filed/reused fix `002-pre-existing-failure-in-src-doctor-doctordiagnostics-ts` and stopped instead of continuing to review or generating a correction for it.

## Blocked From

- lifecycle_state: `implementation_running`
- active_task: `F003-T01`
- active_correction_task: `none`
- active_unblock_task: `none`
- recoverability: agent

## Last Approved Change

None for feature `003-doctor-command`; the latest repository-level change recorded in the supplied state is completion of feature `002-configuration-model`.

## Known Gaps

- The supplied planning sources do not identify the current CLI entrypoint or the physical configuration-loader path, so those bindings remain for task planning.
- The existing project-state preflight may need to be reused or folded into the Doctor diagnostic report without duplicating configuration or runtime policy.
- The full readiness command, its complete check set, and its automated coverage remain unimplemented by this feature.

## Next Planning Hint

Plan a doctor recovery task for blocker `review-failure-implementation-running-task-f003-t01-hit-a-quality-gate-failure-npm-test-confirme` and then restore `implementation_running`.
