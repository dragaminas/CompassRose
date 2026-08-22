# Feature: Automated Development Loop

## Status

Formalized

## Purpose

Iterate Planning → Implementation → Quality Gates → Review over every validated feature and fix
until no selectable work remains, setting aside what it cannot resolve instead of stopping, and
closing out features whose specification is satisfied.

## Problem It Solves

The loop exists and works step by step, but it cannot survive a blocked item, cannot be directed,
and cannot declare a feature finished. In practice that meant a single blocked feature halted all
progress for weeks while the rest of the system was built outside the tool, and the one feature that
did finish was closed by hand.

## Scope

This feature includes:

- separating a blocked work item (a normal outcome: set aside, run continues) from an engine failure (fatal: run stops)
- continuing to the next selectable item after a block, and reporting at the end what advanced and what is waiting
- an optional run target, restricting a run to one named feature or fix
- automatic completion: when a work item's outline is exhausted with every task approved, verifying the specification's acceptance criteria and marking it completed
- one git commit per approved task, carrying its own bookkeeping, with a descriptive message
- an end-of-run summary distinguishing completed, advanced, blocked, awaiting-specification, and awaiting-validation items
- the existing plan/implement/gate/review/correction pipeline, unchanged in substance

This feature does not include:

- authoring specifications; an unspecified request is reported, never formalized (`024-specification-flow`)
- the conversation that resolves a blocked item (`026-conversational-doctor-recovery`)
- the terminal rendering of progress (`023-terminal-session`)
- how each step's context is assembled and bounded (`027-bounded-work-item-context`)
- running multiple work items concurrently

## User-Facing Behavior

A run selects work by a fixed priority — items already in flight, then critical and high-severity
fixes, then features in numeric order, then minor fixes — or works exclusively on a named target
when one is given.

For each selected item it plans one task, implements it, runs the configured quality gates, and
reviews the resulting diff. An approved task is committed. A rejected task produces a bounded
correction task. When correction attempts are exhausted, the item is blocked.

A blocked item is set aside. The run reports it and moves to the next selectable item. It is not
re-selected on later runs until a human resolves it.

An engine failure stops the run immediately and reports what broke, because continuing would mean
building on a broken base.

When an item's outline is exhausted and every task is approved, the runtime checks the acceptance
criteria written in its specification. If they are satisfied, the item is marked completed and the
run continues. If they are not, the item is blocked with the unmet criteria as the reason.

The run ends when nothing selectable remains, when a declared limit is reached, or when the human
stops it. It always ends with a summary of what happened to every item it touched.

## Acceptance Criteria

- a blocked work item does not end the run; the next selectable item is attempted
- an engine failure ends the run and is reported distinctly from a block
- the two are distinguishable in the run summary and in the process exit code
- a run given a target works only on that item and reports if the target is not selectable
- a run without a target follows the existing priority order unchanged
- an item whose outline is exhausted with all tasks approved and acceptance criteria met is marked completed by the runtime
- an item whose outline is exhausted with acceptance criteria unmet is blocked, naming the unmet criteria
- each approved task produces exactly one commit, whose message describes the change rather than the pipeline step
- state-document updates for a task are included in that task's commit, not committed separately
- the end-of-run summary accounts for every item the run touched, by outcome
- a stop requested by the human takes effect at a step boundary with state persisted
- items awaiting specification or validation are reported, never processed

## Implementation Deliverables

- a step-outcome type distinguishing `advanced`, `blocked`, and `failed`, replacing the current exit-code-only signal
- `run()` reworked to continue on `blocked` and stop on `failed`
- run-target resolution and its enforcement in `determineNextStep`
- acceptance-criteria verification and the automatic completion transition
- commit batching: one commit per approved task, absorbing intermediate bookkeeping
- the end-of-run summary model and its report
- migration of existing state documents whose lifecycle depends on the old behavior

## Completion Criteria

This feature is considered implemented when a run over this repository advances every selectable
feature, sets aside the ones it cannot resolve without ending, closes the ones whose specification
is satisfied, and leaves a git history in which each commit is a unit of real work.

## Implementation Outline

1. Introduce the step-outcome distinction and rework `run()` around it
2. Add run targeting
3. Add acceptance-criteria verification and automatic completion
4. Rework committing to one commit per approved task
5. Add the end-of-run summary

## Relationship to CompassRose Principles

- the loop consumes specifications and never authors them
- every loop is bounded and interruptible
- a blocked item waits for a human rather than being retried forever
- the repository, not a chat, holds the state the loop resumes from
