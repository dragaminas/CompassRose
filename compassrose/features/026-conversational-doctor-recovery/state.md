# State: Conversational Doctor Recovery

## Lifecycle State

formalized

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run
- validation: confirmed

## Current Reality

Specified jointly with the user in the specification round of 2026-08-22; every product and
architecture decision in `feature.md` and `architecture.md` was made by the user, with contracts,
schemas, and implementation detail filled in by the agent.

The agentic recovery pipeline this feature removes is fully present:
`doctor-recovery-planning-prompt.md`, `doctor-recovery-execution-prompt.md`, `recoveryLessons.ts`,
`recoveryHistoryCompaction.ts`, the `doctor_recovery_task` step kind, and the `unblock_pending`
inspection kind. Feature `003-doctor-command` accumulated nine recovery tasks under it without ever
unblocking.

Two of the four specified exits already exist and are reused verbatim: `blocked_on_fix` with its
deterministic resume, and `acknowledgeBlocker`. The `003` migration named in the outline was
completed early: that feature was closed during the specification round itself.

## Implemented Deliverables

- None

## Remaining Deliverables

- Every deliverable listed in `feature.md`.

## Outline Progress

- 1. Remove the doctor-recovery task pipeline and bound diagnostic autocorrection to one attempt: not started
- 2. Add the diagnosis contract, its generation, and its persistence: not started
- 3. Build the recovery conversation loop with its bound and resumability: not started
- 4. Implement the retry-with-context and specification-correction exits: not started
- 5. Wire the existing fix and acknowledgment machinery as the third and fourth exits: not started
- 6. Migrate feature `003-doctor-command` off the removed recovery model: not started

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Formalized and validated in the specification round of 2026-08-22.

## Known Gaps

- None recorded yet; this feature has not been implemented.

## Next Planning Hint

Start with the deletion. Removing the recovery-task pipeline before reworking the loop avoids porting code that is about to disappear.
