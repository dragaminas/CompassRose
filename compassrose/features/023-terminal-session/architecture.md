# Architecture: Terminal Session

## Boundaries

The session is a presentation and dispatch layer. It owns the terminal and the conversation; it
owns no domain logic. Every action it can take is an existing public method on
`CompassRoseOrchestrator`, or a new one added deliberately for it. The session must never read or
write `state.md`, git, or configuration directly.

Inverting this is the failure mode to avoid: a session that grows its own state model produces a
second, competing source of truth alongside the repository documents.

## Rendering Stack

No new runtime dependencies. The project has zero today, and that constraint is preserved.

Rendering splits in two:

- **Pure render functions** — take a plain state value, return `string[]`. No I/O, no ANSI beyond
  what belongs inside a line. This is the existing `renderBlockerCard` pattern generalized, and it
  is the only layer that has tests.
- **A terminal writer** — takes `string[]` frames and writes them. Owns cursor movement, line
  clearing, the spinner tick, and the non-TTY fallback. Deliberately thin and deliberately untested
  by unit tests; its correctness is verified by hand.

The writer uses the minimum ANSI needed for frame replacement (`\r`, erase-line, cursor-up). When
stdout is not a TTY, frame replacement degrades to appending the final frame only, so piped and CI
output stays clean. Note that this repository has already been bitten by ANSI leaking into captured
output; the writer is the only place in the codebase permitted to emit escape sequences.

## Determinism Boundary

The session has exactly two kinds of input, and the distinction is structural, not inferred:

- **A line starting with `/`** is a command. It is looked up in a fixed registry. Unknown commands
  are rejected. This is the only path that can change repository state.
- **Anything else** is a conversation turn. It goes to the agent and comes back as text. It can
  never change repository state.

The model is never asked "what does the user want to do". This preserves ADR-0007 — no state
transition is ever decided by model judgment — while allowing the conversation itself to be
open-ended.

## Command Registry

A single table, defined in one file, mapping literal command names to a handler and a one-line
help string. `/help` renders it. Adding a capability to the session means adding a row; there is no
other way in.

The initial set:

| Command | Effect |
|---|---|
| `/crear` | Draft the currently-discussed idea into a feature (`024`) |
| `/listo` | Confirm the validation of the feature under discussion (`024`) |
| `/run` | Start the automated loop (`025`) |
| `/desbloquear` | Enter the failure conversation for a blocked item (`026`) |
| `/status` | Render the current project state |
| `/doctor` | Run the read-only diagnostic report |
| `/salir` | End the session |

`crear`, `listo`, and `terminado` already exist as bare keywords in `brainstorm.ts` and
`validationLoop.ts`. They become slash commands here; the bare-keyword forms are retained as
aliases so existing muscle memory and the documented flow keep working.

## Interruption

Stop is cooperative and already partially built: `src/runtime/controlledStop.ts` exists. The session
installs a keypress listener that sets the stop flag, and the orchestrator's loop checks it at step
boundaries. A stop never aborts a step in flight — an implementer subprocess is allowed to finish so
the worktree is never left mid-write.

`Ctrl-C` maps to the same cooperative stop on first press. A second press within the same run exits
the process, matching what a terminal user expects as an escape hatch.

## Failure Explanation

Two layers, and they are not alternatives:

- The **structured record** (`BlockerProfile` written to `## Blocked By`) is unchanged. It stays the
  machine-readable, durable evidence.
- The **explanation** is generated from that structured record plus the step's captured output, and
  is rendered into the session. It is bounded by the same contract discipline as every other agent
  output: a schema-validated response, not free narration.

The explanation is generated once, at the moment of failure, and is retained in the session so
follow-up questions do not re-derive it. Follow-up questions are ordinary conversation turns scoped
to that failure.

## Non-Interactive Path

`compassrose <subcommand>` never constructs the session. The subcommands keep their current
behavior and exit codes. `compassrose` with no arguments changes meaning: it opens the session
instead of running the orchestrator once. The previous behavior moves to `compassrose run`.

This is a deliberate breaking change to the default invocation, confined to this repository's own
scripts, which are updated in the same change.

## Module Layout

```text
src/session/
  session.ts          session runtime: prompt loop, dispatch, lifecycle
  commands.ts         the command registry
  render/
    header.ts         project header frame
    progress.ts       live loop progress frame
    failure.ts        failure explanation frame
  terminalWriter.ts   ANSI writer + non-TTY fallback
```

`src/orchestrator/blockerCard.ts` already produces `string[]` and is reused as-is by
`render/failure.ts`.

## Testing Strategy

- Render functions: assert on `string[]` equality. No terminal, no snapshots of escape sequences.
- Command dispatch: assert that a given input line reaches the expected orchestrator method, and
  that a conversation turn reaches none of them.
- Interruption: assert the stop flag is observed at a step boundary and that state is persisted.
- The writer and the live view are verified by hand, matching this repository's existing convention
  for CLI layers (`featureValidation.ts`, `brainstorm.ts`, `acknowledgeBlocker.ts`).

## Constraints

- Zero new runtime dependencies
- All rendering testable without a terminal
- No repository state readable or writable from the session layer
- Escape sequences confined to `terminalWriter.ts`
- Windows-first: the primary development and usage platform is Windows Terminal on Windows 11
