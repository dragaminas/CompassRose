# Feature: Conversational Doctor Recovery

## Status

Formalized

## Purpose

Replace the agentic doctor-recovery task pipeline with a bounded conversation that finds the root of
a blockage together with the human and ends in one concrete decision.

## Problem It Solves

Recovery today is a machine talking to itself. A blocked item triggers a chain of planned and
executed repair tasks that write lessons, compact history, and re-enter the pipeline — nine of them
on a single feature, without unblocking it and without ever asking the human a question. The
artifacts it produces are the least readable in the repository, and the human's only remaining move
is to read them.

Meanwhile the information that would resolve most blockages — whether a file was supposed to change,
whether the spec anticipated a coupling, whether an external service is down — exists only in the
human's head and is never requested.

## Scope

This feature includes:

- removing the doctor-recovery task pipeline: its planning and execution prompts, recovery lessons, and recovery-history compaction
- bounding diagnostic autocorrection to a single attempt
- a recovery conversation opened when that attempt fails, or when a blocker is classified as requiring a human
- an agent diagnosis that presents two or three ordered root-cause hypotheses, each with its supporting evidence and the question that would confirm or rule it out
- four exits, matching the four places a root cause can live: retry with what was learned, correct the specification, open a separate fix, or resolve it by hand and confirm
- explicit human confirmation before the specification-correction exit, which is the only one that invalidates planned work
- a record of what was discarded and why when planned work is invalidated
- bounded conversation length, with the blocker left standing if the bound is reached

This feature does not include:

- the terminal session hosting the conversation (`023-terminal-session`)
- the specification conversation the second exit hands off to (`024-specification-flow`)
- the loop's decision to set a blocked item aside and continue (`025-automated-development-loop`)
- automatic repair of any kind beyond the single retained diagnostic retry

## User-Facing Behavior

When a step fails, the runtime classifies the failure and retries once. If the retry succeeds, the
run continues and the human is told what happened in one line.

If it fails again, or if the blocker is one no automatic action can address, the item is blocked and
a recovery conversation is offered. The conversation is not forced: the run sets the item aside and
continues, and the human enters the conversation when they choose.

The conversation opens with the agent's diagnosis: two or three possible root causes, ordered by
likelihood, each stating the evidence in the repository that supports it and the specific question
that would confirm or rule it out. The human answers only what the agent cannot determine on its
own.

The conversation ends in exactly one of four decisions, offered in the order the agent's leading
hypothesis suggests:

- **Retry with what was learned** — what the human said becomes bounded context for a fresh attempt at the failed step.
- **Correct the specification** — the blockage revealed a wrong or incomplete spec. Requires an explicit confirmation, because planned work is invalidated. Hands off to the specification flow for that item, and records what was discarded and why.
- **Open a separate fix** — the root cause lies outside this item. A fix is created carrying what was discovered; the item waits on it and resumes deterministically when the fix completes.
- **Resolve by hand** — the human fixes it outside the tool and confirms, which restores the item to its recorded pre-block state.

If the conversation reaches its bound without a decision, the item stays blocked and the
conversation can be resumed later from the same diagnosis.

## Acceptance Criteria

- the doctor-recovery task pipeline is removed, along with recovery lessons and recovery-history compaction
- diagnostic autocorrection attempts a failed step at most once
- a blocked item never triggers automatic repair beyond that single attempt
- the recovery conversation opens only on explicit human action, never automatically mid-run
- the diagnosis presents at least two hypotheses, each with supporting evidence and a discriminating question
- the diagnosis is generated once per blockage and reused when the conversation is resumed
- each of the four exits is reachable and produces its stated effect
- the specification-correction exit refuses to proceed without an explicit confirmation
- invalidated planned work is recorded with what was discarded and why, never silently deleted
- an exhausted conversation leaves the item blocked and resumable, never partially transitioned
- no exit is selected by the model; every one requires a literal human choice

## Implementation Deliverables

- removal of `doctor-recovery-planning-prompt.md`, `doctor-recovery-execution-prompt.md`, `recoveryLessons.ts`, `recoveryHistoryCompaction.ts`, and the `doctor_recovery_task` / `unblock_pending` step kinds
- a diagnosis contract: ordered hypotheses with evidence and discriminating questions, schema-validated
- diagnosis persistence, so a resumed conversation does not re-derive it
- the recovery conversation loop and its bound
- the retry-with-context exit, threading the conversation into the retried step's bounded context
- the specification-correction exit, its confirmation gate, and the invalidation record
- reuse of the existing `blocked_on_fix` machinery for the third exit
- reuse of `acknowledgeBlocker` for the fourth exit, moved inside the conversation
- migration for feature `003-doctor-command`, whose state carries nine recovery cycles under the removed model

## Completion Criteria

This feature is considered implemented when a blocked item can be resolved by a human answering two
or three questions in the terminal, ending in a decision the runtime carries out — with no repair
task planned, no lessons file written, and no recovery history to compact.

## Implementation Outline

1. Remove the doctor-recovery task pipeline and bound diagnostic autocorrection to one attempt
2. Add the diagnosis contract, its generation, and its persistence
3. Build the recovery conversation loop with its bound and resumability
4. Implement the retry-with-context and specification-correction exits
5. Wire the existing fix and acknowledgment machinery as the third and fourth exits
6. Migrate feature `003-doctor-command` off the removed recovery model

## Relationship to CompassRose Principles

- the human is asked for what only the human knows, instead of being handed artifacts to interpret
- the model diagnoses and proposes; a literal human choice decides
- bounded context: the conversation is short and its product is a decision, not a document
- invalidating work is a recorded, deliberate act, never a side effect
