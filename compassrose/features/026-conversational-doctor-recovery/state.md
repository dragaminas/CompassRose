# State: Conversational Doctor Recovery

## Lifecycle State

implementation_running

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

The conversation was built before the deletion, deliberately: it is the part the user asked for, and
delivering it first meant the new way out existed before the old machinery was dismantled.

## Implemented Deliverables

- the diagnosis contract (`recovery-diagnosis.schema.json`, `recoveryDiagnosis.ts`): two or three ordered hypotheses, each with repository-readable evidence and the one discriminating question the human can answer that the repository cannot. The schema enforces the minimum of two, so the conversation never anchors the human on a single explanation.
- diagnosis generation and persistence. A resumed conversation reloads the stored diagnosis rather than re-deriving it: a second call would produce a *different* set of hypotheses and the human would find themselves answering a different question than the one they left. A new diagnosis is generated only when the blocker signature changes.
- the recovery conversation in `/desbloquear`: card, diagnosis, then the four exits.
- the `retry` exit (`retryWithContext`): what the human said is written into `Current Reality` as a fact, which is how it reaches the next attempt — nothing is carried in memory.
- the `correct_specification` exit (`correctSpecification`, `invalidatedWorkFor`): names exactly what will be superseded, requires an explicit `listo`, refuses to proceed without a recorded reason, marks outstanding task requests superseded, and returns the item to pending specification. Nothing is deleted from git.
- the `resolve_by_hand` exit, reusing `acknowledgeBlocker`.
- `tests/recoveryConversation.test.ts`: 10 tests over exit exhaustiveness, ordering-not-narrowing, and the diagnosis rendering.
- **automatic repair is no longer attempted.** `plan_doctor_recovery` no longer plans or executes anything: the item is blocked, marked as needing a human, and the way out is `/desbloquear`. The blocked outcome means the run sets it aside and carries on rather than grinding there.

### What the e2e scenarios revealed

Two of them now cost *zero* AI calls where they previously spent several. The diagnosis for
`implementation_failed` is entirely deterministic, and every call the scenario no longer makes is
one that used to plan and execute a repair nobody asked for. That is asserted explicitly rather
than relaxed away, because the reduction is the outcome, not a side effect.

One scenario was retired rather than reinterpreted. `unblock-doc-code-mismatch` checked whether a
doctor recovery *task* may carry documentation and code together; no such task is ever planned
now, so the rule it tested has no subject. A test whose name and body disagree is worse than no
test.

## Remaining Deliverables

- the `open_fix` exit: the one of the four that still needs its own wiring. The `blocked_on_fix` machinery it will reuse already exists; what is missing is filing a fix from inside the conversation.
- deletion of the now-unreachable code: `doctor-recovery-planning-prompt.md`, `doctor-recovery-execution-prompt.md`, `recoveryLessons.ts`, `recoveryHistoryCompaction.ts`, the `doctor_recovery_task` step kind, the `unblock_pending` inspection kind, and the `doctor_recovery_attempts` / `active_unblock_task` fields. The routing that reached them is gone, so this is cleanup rather than behavior change -- but it is ~134 references across a 7,300-line file and deserves its own pass rather than being rushed at the end of another.
- bounding diagnostic autocorrection to a single attempt
- the conversation's turn bound

## Outline Progress

- 1. Remove the doctor-recovery task pipeline and bound diagnostic autocorrection to one attempt: in progress
- 2. Add the diagnosis contract, its generation, and its persistence: complete
- 3. Build the recovery conversation loop with its bound and resumability: in progress
- 4. Implement the retry-with-context and specification-correction exits: complete
- 5. Wire the existing fix and acknowledgment machinery as the third and fourth exits: in progress
- 6. Migrate feature `003-doctor-command` off the removed recovery model: complete (that feature was closed during the specification round itself)

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
