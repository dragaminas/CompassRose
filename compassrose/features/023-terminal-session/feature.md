# Feature: Terminal Session

## Status

Formalized

## Purpose

Give CompassRose a single interactive terminal session as its primary interface, replacing the
current set of six independent batch scripts, so that specification, execution, and unblocking all
happen in one continuous place the user can watch and interrupt.

## Problem It Solves

CompassRose's current surface is six npm scripts that each take the terminal and exit. The user
cannot see work as it happens, cannot intervene mid-run, and cannot ask a question about a failure
without leaving the tool and reading a document. In practice this made the tool opaque to its own
author: a person who set the architecture but cannot follow implementation at machine speed has no
way to stay oriented.

## Scope

This feature includes:

- an interactive session opened by running `compassrose` with no arguments
- free-form conversational input in the session, answered by the configured agent
- explicit, literal commands as the only way to change state (`/crear`, `/run`, `/desbloquear`, `/status`, `/doctor`, `/salir`)
- a live progress view while the automated loop runs, showing the current work item, each step, its result, and elapsed time
- clean interruption of a running loop at a step boundary, returning to the prompt with state persisted
- in-session, human-language explanation of any failure, with follow-up questions answered in the conversation
- a first-class rendering layer built as pure functions returning `string[]`, with a thin ANSI writer
- surviving non-interactive subcommands for CI and scripting

This feature does not include:

- what the specification conversation actually does (`024-specification-flow`)
- what the automated loop actually does (`025-automated-development-loop`)
- the content of the failure conversation and its recovery decisions (`026-conversational-doctor-recovery`)
- how per-work-item context is bounded (`027-bounded-work-item-context`)
- any graphical or editor-embedded interface (`021-vscode-integration`)
- multiple concurrent sessions or background execution while the session stays usable

## User-Facing Behavior

Running `compassrose` in a CompassRose-initialized repository opens a session that prints a short
header (project name, feature count, anything blocked) and a prompt.

Typing plain text is a conversation turn: the agent replies, and nothing in the repository changes.

Typing a slash command performs the one state transition it names, and only that one. The set is
fixed and known to the runtime; the model never selects it.

Typing `/run` starts the automated loop inside the session. Each step appends a line as it
completes and the current step shows live elapsed time. Pressing `Esc` (or `Ctrl-C`) requests a
stop, which takes effect at the next step boundary; the session then returns to the prompt with the
work item's state fully persisted.

When a step fails, the loop stops, the failure is explained in the session in human language, and
the prompt returns so the user can ask about it or decide what to do. The structured evidence is
still written to the work item's `state.md`, which becomes the historical record rather than the
place the user must go to understand what happened.

Running `compassrose <subcommand>` bypasses the session entirely and behaves non-interactively,
with a meaningful process exit code.

## Acceptance Criteria

- `compassrose` with no arguments opens an interactive session; it no longer runs the orchestrator loop directly
- conversational turns never mutate repository state
- every state transition is reachable only through an explicit literal command
- an unknown slash command is reported as unknown and changes nothing
- the loop's progress view updates while a step is in flight and appends a result line when it completes
- a stop request during a running loop takes effect at the next step boundary, leaves the worktree in a committed or cleanly-recorded state, and returns to the prompt
- a failed step produces a human-language explanation in the session, and the structured record in `state.md` is still written
- rendering functions are unit-testable by comparing `string[]` values, with no terminal emulation
- `compassrose doctor`, `compassrose run`, and `compassrose setup` work non-interactively and return correct exit codes
- the session degrades to append-only output when stdout is not a TTY

## Implementation Deliverables

- a session runtime module owning the read/dispatch/render cycle
- a fixed command registry mapping literal commands to orchestrator entry points
- pure render functions for the session header, progress view, blocker card, and failure explanation
- a terminal writer handling frame replacement, spinner, and non-TTY fallback
- a stop-request channel wired to the existing `src/runtime/controlledStop.ts`
- reworked `src/cli/main.ts` dispatch: no-args opens the session; named subcommands stay non-interactive
- `package.json` scripts aligned to the new surface

## Completion Criteria

This feature is considered implemented when a user can open one session, specify a feature, run the
loop on it, watch it work, interrupt it, see a failure explained in place, ask about it, and resume
— without leaving the session or reading a generated document to understand what happened.

## Implementation Outline

1. Build the terminal writer and the pure render layer
2. Build the session runtime: prompt loop, conversation turns, command registry
3. Wire the automated loop into the session with live progress and clean interruption
4. Wire failure explanation and follow-up questions into the session
5. Rework CLI dispatch and package scripts around the session as the primary entry point

## Relationship to CompassRose Principles

- documentation remains the durable record, but stops being the place a human must go to understand what just happened
- no state transition is ever decided by the model (ADR-0007); the session widens the conversation without widening the model's authority
- every loop is bounded and interruptible
