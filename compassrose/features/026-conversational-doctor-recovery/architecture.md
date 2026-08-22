# Architecture: Conversational Doctor Recovery

## What Gets Deleted

This feature is defined as much by removal as by addition. The following go away entirely:

- `src/contracts/planner/doctor-recovery-planning-prompt.md`
- `src/contracts/runtime/doctor-recovery-execution-prompt.md`
- `src/orchestrator/recoveryLessons.ts`
- `src/orchestrator/recoveryHistoryCompaction.ts`
- the `doctor_recovery_task` step kind and the `unblock_pending` inspection kind
- `doctor_recovery_attempts` and `active_unblock_task` from the operational-status model
- `.git/proto-compassrose/recovery-lessons/`

The deletion is the point. Every one of these exists to let the machine repair itself without asking,
and the accumulated evidence is that it does not work: nine cycles on one feature, each producing
documents nobody could act on.

`diagnostic-autocorrection` survives, bounded to one attempt. It is cheap, it classifies a failure
against a fixed taxonomy, and a single retry genuinely resolves transient cases (a provider hiccup, a
lost diff). What it must not do is chain.

## The Four Exits Are a Partition

The exits are not a menu of features; they are the four places a root cause can be, and together
they are exhaustive:

| Root cause lives in | Exit | Status |
|---|---|---|
| what the agent did not know | retry with learned context | new, cheap |
| the specification | correct the spec and replan | new, the important one |
| elsewhere in the codebase | open a fix | exists (`blocked_on_fix`) |
| outside the repository | resolve by hand and confirm | exists (`acknowledgeBlocker`) |

Dropping any one leaves a class of blockage with no way out. Two are already built and are reused
verbatim, which is why the whole feature is smaller than what it replaces.

The specification-correction exit is what closes the circuit between the two flows. Without it,
Flow 1 feeds Flow 2 one way and a wrong specification is a permanent dead end — which is exactly
what happened to `003-doctor-command`.

## Diagnosis Contract

Schema-validated, following the existing contract discipline:

```ts
interface RecoveryHypothesis {
  readonly summary: string;
  readonly evidence: readonly string[];      // facts drawn from the repository, bounded
  readonly discriminatingQuestion: string;   // what the human can answer that the agent cannot
  readonly suggestedExit: RecoveryExit;
}

interface RecoveryDiagnosis {
  readonly itemId: string;
  readonly blocker: BlockerProfile;
  readonly hypotheses: readonly RecoveryHypothesis[];  // 2..3, ordered by likelihood
  readonly generatedAt: string;
}
```

Two constraints on the contract, both enforced by the validator rather than by prompt wording:

- at least two hypotheses, so the conversation never anchors the human on a single explanation
- every `evidence` entry must be a fact readable from the repository, and every
  `discriminatingQuestion` must be something that is not — the division of labor is the whole point

`suggestedExit` orders how exits are offered. It is a suggestion about ordering only; it can never
select an exit.

## Persistence and Resumability

The diagnosis is generated once, when the item is blocked, and stored alongside the blocker record
in the artifact store. Resuming a conversation reloads it rather than re-deriving it: re-running the
diagnosis would spend a call to produce a different set of hypotheses, and the human would be
answering a different question than the one they left.

The conversation transcript is held in the session and is not persisted. What persists is the
decision and its consequence, written into the item's `state.md`. This is the same discipline as
everywhere else in the codebase — the durable record is the outcome, never the chat.

## Bounds

- one diagnostic autocorrection attempt per failed step
- a declared maximum of conversation turns per blockage
- reaching the bound leaves the item blocked with the diagnosis intact and the conversation resumable

There is deliberately no "attempts" counter that escalates. The previous model's
`doctor_recovery_attempts` existed to bound a loop that should not have existed.

## The Specification-Correction Exit

The only exit that destroys work, and therefore the only one with a confirmation gate.

Sequence:

1. the human chooses it
2. the runtime lists exactly what will be invalidated: which tasks, which approved work, which state
3. the human confirms with a literal keyword
4. the invalidation record is written to the item's `state.md` — what was discarded, why, and when
5. the item transitions to pending specification and the specification flow opens on it
6. after the corrected specification is validated, planning restarts from it

Nothing is deleted from git. Invalidation means the task documents are marked superseded and the
item replans; the commits stay, because the history of what was tried is the one artifact worth
keeping.

## Entry Point

The conversation is never opened automatically mid-run. `025-automated-development-loop` sets a
blocked item aside and continues; the human enters the conversation when they choose, through the
session's `/desbloquear` command.

This matters for the unattended iteration the whole system is for: a blockage must not turn an
overnight run into a machine waiting at a prompt.

## Migration

`003-doctor-command` carries nine recovery cycles, an `active_unblock_task`, a
`doctor_recovery_attempts` counter, and a compacted recovery history — all under the removed model.
Its state document is migrated to the new shape as part of this feature, and its actual blockage is
resolved through the new conversation as the first real exercise of it.

## Constraints

- No new runtime dependencies
- The model diagnoses; it never selects an exit
- No automatic repair beyond one diagnostic retry
- The conversation's product is a decision, never a document
- Invalidation is always recorded, never silent
