# State: Conversational Doctor Recovery

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- validation: confirmed

## Current Reality

Specified jointly with the user in the specification round of 2026-08-22; every product and
architecture decision in `feature.md` and `architecture.md` was made by the user, with contracts,
schemas, and implementation detail filled in by the agent.

The agentic recovery pipeline is gone: unreachable first, then deleted. Nothing plans or executes
a repair task, and nothing is left behind that describes one.

Feature `003-doctor-command` accumulated nine recovery tasks under the old model without ever
unblocking, which is the evidence this feature was shaped by.

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
- **automatic repair is no longer attempted.** The decision that used to plan a repair task blocks the item instead, marks it as needing a human, and points at `/desbloquear`. The blocked outcome means the run sets it aside and carries on rather than grinding there.
- **the pipeline is deleted, not merely unreachable** (~830 lines from `orchestrator.ts` alone). Gone: `planDoctorRecoveryTask` with its two bounded-retry guards and three error classes, `runDoctorRecoveryTask`/`executeDoctorRecoveryTask`/`stopAfterDoctorRecoveryFailure`, both restoration writers and their `updateFeatureStateAfterUnblock`/`updateProjectStateAfterUnblock` aliases, the `unblock_task` and `doctor_recovery_task` step kinds, the `unblock_pending` lifecycle state, `DoctorRecoveryTaskMetadata`/`UnblockTaskMetadata` with their parser and renderer, five contract documents, and the `active_unblock_task` / `last_unblock_result` / `doctor_recovery_attempts` / `doctor_recovery_lifetime_count` state fields with the two config limits that bounded them.
- **an honest name for what is left.** `plan_doctor_recovery` named an action the runtime no longer takes, so the decision value is `block_for_conversation` and its interface mode is `recovery_conversation`. Both older spellings still normalize forward, because diagnostic artifacts on disk still carry them.
- **the migration rides in the writer.** `replaceOperationalStatus` carries every existing key forward by design, so the four retired keys would have outlived the mechanism in every `state.md` forever. It now prunes them, which migrates each document the first time the runtime touches it; this repository's own fifteen state documents were migrated in the same commit.
- **a stale `unblock_pending` document degrades rather than crashes.** No writer produces that lifecycle state any more, and `inspectFeature`/`inspectFix` no longer name it, so a document from an older CompassRose falls through to `malformed` and gets repaired by `correct_state` — the same path any other unrecognized state takes.

### What the e2e scenarios revealed

Two of them now cost *zero* AI calls where they previously spent several. The diagnosis for
`implementation_failed` is entirely deterministic, and every call the scenario no longer makes is
one that used to plan and execute a repair nobody asked for. That is asserted explicitly rather
than relaxed away, because the reduction is the outcome, not a side effect.

Two scenarios were retired rather than reinterpreted. `unblock-doc-code-mismatch` checked whether
a doctor recovery *task* may carry documentation and code together, and `unblock` scripted a whole
plan-execute-review recovery cycle; no such task is ever planned now, so neither rule has a subject
left. A test whose name and body disagree is worse than no test. What replaced them is asserted by
`recoverable-review-blocked` and `implementation-failed-recovery`, which now check that no recovery
task is planned at all.

### The rule the deletion followed

The suite had to go green without a single assertion being *reinterpreted*. Deleting a test for
deleted behavior is legitimate; changing what a surviving test expects is a behavior change hiding
inside a cleanup. Under that rule only two files were deleted outright
(`doctorRecoveryLimit.test.ts`, `taskContentValidationWiring.test.ts`), a handful of individual
tests went with the functions they called, and every remaining edit was either the renamed decision
value or a fixture shedding a retired key.

## Remaining Deliverables

- the `open_fix` exit: the one of the four that still needs its own wiring. The `blocked_on_fix` machinery it will reuse already exists; what is missing is filing a fix from inside the conversation.
- bounding diagnostic autocorrection to a single attempt
- the conversation's turn bound
- wiring coverage for planner-output sanitization. `taskContentValidationWiring.test.ts` proved that `sanitizeAllowedPaths` and `validateQualityGateRefs` were actually *called*, and it proved it through `planDoctorRecoveryTask`. The helpers stay covered by `taskContentValidation.test.ts` and both are still called (by `planTask`/`planFixTask` and the correction path), but nothing asserts that wiring any more. Recorded as a real gap rather than quietly reported as covered.

## Outline Progress

- 1. Remove the doctor-recovery task pipeline and bound diagnostic autocorrection to one attempt: pipeline removed; the autocorrection bound is not
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

## Last Approved Change

Formalized and validated in the specification round of 2026-08-22.

## Known Gaps

- The recovery conversation has no declared turn bound yet. Every other loop in this codebase declares its own ceiling; this one does not, and should.
- Diagnostic autocorrection is not yet bounded to a single attempt, though the chain it used to feed no longer exists.
- `recoveryLessons.ts` and `recoveryHistoryCompaction.ts` were listed here as unreachable. They are not: both are still called from the surviving planner, implementer, and reviewer paths. Checked before deleting rather than after.

## Next Planning Hint

Wire the `open_fix` exit, then bound the conversation's turns and diagnostic autocorrection's attempts.
