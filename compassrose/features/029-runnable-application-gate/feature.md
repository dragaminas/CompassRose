# Feature: Runnable Application Gate

## Status

Formalized

## Purpose

Verify that the application actually starts before a feature is allowed to close, so that "the
iteration ends with a running application" is a checked property rather than an assumption.

## Problem It Solves

Every existing quality gate — typecheck, tests, lint, build — can pass on an application that does
not start. Nothing in the system distinguishes "this compiles and its tests pass" from "this runs".
Without that check, features accumulate as completed over an application nobody has started.

## Scope

This feature includes:

- a declared start command and a declared success condition in project configuration
- three success-condition forms: exit code, expected text in output, and an HTTP endpoint answering
- a declared timeout, after which the start attempt counts as failed
- reliable teardown of anything the check started, including on timeout and on failure
- running the gate as the last condition before a feature is marked completed, alongside acceptance-criteria verification
- blocking the feature — not the run — when the gate fails, with the captured output as evidence
- start-command candidates proposed by project detection, never written to configuration automatically
- an explicit "this project has no meaningful start" declaration that skips the gate

This feature does not include:

- per-task execution of the gate; the per-task quality gates are unchanged
- health checking, monitoring, or any long-running supervision
- multi-service orchestration, containers, or environment provisioning
- deciding what "running" means through model judgment

## User-Facing Behavior

The project configuration declares a `smoke` block: the command that starts the application, the
condition that proves it started, and a timeout.

When a feature's outline is exhausted and its acceptance criteria are met, the runtime runs that
command and evaluates the condition. Whatever it started is torn down afterwards, in every outcome.

If the condition is met, the feature is marked completed and the run continues.

If it is not — wrong exit code, missing expected text, endpoint not answering, or timeout — the
feature is not completed. It is blocked, with the start command, the captured output, and the unmet
condition as evidence, and with `recoverability: human`. The run continues with the next selectable
item.

A project that declares no meaningful start condition skips the gate entirely, and that skip is
recorded in the feature's state document rather than being silent.

## Acceptance Criteria

- the start command, success condition, and timeout are read from project configuration and validated
- the three success-condition forms are each supported and each independently testable
- the gate runs after acceptance-criteria verification and before the completion transition
- the gate does not run as part of any task's quality gates
- a passing gate allows the feature to be marked completed
- a failing gate leaves the feature blocked, not completed, with the captured output as evidence
- a failing gate does not end the run; the next selectable item is attempted
- a timeout is treated as a failure and is distinguishable from a wrong exit code in the evidence
- anything the gate started is terminated afterwards, including on timeout, failure, and exception
- output captured by the gate is ANSI-stripped before it is written as evidence
- a project declaring no start condition skips the gate, and the skip is recorded in the state document
- detection may propose start-command candidates; it never writes them to configuration

## Implementation Deliverables

- a `smoke` configuration block, its schema, and its validation in the config loader
- the three success-condition evaluators
- the gate runner, with timeout and guaranteed teardown
- integration into the completion transition owned by `025-automated-development-loop`
- the blocked-on-start-failure path and its evidence shape
- the explicit skip declaration and its recording
- start-command candidate proposal in `028-project-understanding`
- a `smoke` block for this repository itself, covering `compassrose doctor`

## Completion Criteria

This feature is considered implemented when no feature in any CompassRose project can reach
`completed` without the application having been started and observed to work, and when a start
failure parks that one feature without disturbing anything else the run was doing.

## Implementation Outline

1. Add the `smoke` configuration block, its schema, and its validation
2. Implement the three success-condition evaluators
3. Implement the gate runner with timeout and guaranteed teardown
4. Wire the gate into the completion transition and the blocked-on-failure path
5. Add the skip declaration, and start-command candidate proposal in project detection

## Relationship to CompassRose Principles

- "done" is defined by declared, checkable conditions, never by model judgment
- a failing gate is a blocked item, not an engine failure
- evidence is captured and made legible at the point of failure
- the repository declares what its own success looks like
