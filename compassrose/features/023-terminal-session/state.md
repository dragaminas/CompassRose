# State: Terminal Session

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: passed
- last_quality_gate_result: passed
- last_review_result: not_run
- validation: confirmed

## Current Reality

Specified jointly with the user in the specification round of 2026-08-22; every product and
architecture decision in `feature.md` and `architecture.md` was made by the user, with contracts,
schemas, and implementation detail filled in by the agent.

The session is implemented and usable. `compassrose` with no arguments opens it; the previous
no-argument behavior moved to `compassrose run`, and the package scripts follow.

`src/session/terminalWriter.ts` owns every escape sequence in the codebase and degrades to
append-only output when stdout is not a TTY. `src/session/render/` holds the pure `string[]`
renderers — header, progress, failure view — covered by `tests/sessionRender.test.ts` with no
terminal emulation. `src/session/commands.ts` is the fixed command registry and the determinism
boundary: a line starting with `/` is looked up there and nowhere else, an unknown slash word is
reported as unknown, and everything else is conversation that changes nothing. The bare keywords
`crear`, `listo`, and `terminado` keep working as literal transitions, but only when they are the
entire line.

`CompassRoseOrchestrator` gained `setRunObserver` (display-only, per
`src/contracts/runtime/runObserver.ts`), `describeWorkItems`, and `projectName` to support the
session without the session ever touching repository state directly.

### The live view

`run()` is fully synchronous — every adapter call is a `spawnSync` — so the process executing it
can neither animate anything nor read a keypress until it finishes. `/run` therefore executes the
loop in a **child process** and watches it from the session, where the event loop is free.

Both halves talk through files, not IPC, and that is not a shortcut. `process.send()` is
asynchronous, so a step event sent from inside `run()` would sit unflushed until the run ended —
exactly when it stops being live; and `process.on('message')` never fires mid-run for the same
reason, so a stop request could not be delivered that way either. The child appends
newline-delimited JSON to an event log and the parent polls it.
`src/orchestrator/smokeGate.ts` solves the mirror image of this problem the same way, for the same
reason: there the *parent* is blocked and the child records its exit code to a file.

What `esc` does is worth stating precisely, because one half is still bounded by the synchronous
loop:

- **once** requests a controlled stop, which the run notices at its next checkpoint — so a long
  implementer call finishes first. What changed is that the request is *taken* immediately and the
  frame says so.
- **twice** terminates the process tree, agent CLI included. Immediate, and it can leave the
  worktree mid-write, which is why it takes a second, deliberate press.

`Ctrl-C` is the second one. In raw mode it arrives as a keystroke rather than a signal, so the
supervisor handles it explicitly instead of relying on a handler that would never run.

## Implemented Deliverables

- the session runtime owning the read/dispatch/render cycle, with end-of-input handling
- the fixed command registry: `/help`, `/status`, `/doctor`, `/run`, `/desbloquear`, `/crear`, `/listo`, `/salir`
- pure render functions for the header, run progress, run summary, and failure view
- the terminal writer, with frame replacement and non-TTY fallback
- reworked `src/cli/main.ts` dispatch and aligned `package.json` scripts
- `tests/sessionRender.test.ts`: 26 tests over the render and dispatch layers

- the run channel (`src/runtime/runChannel.ts`): append-only event log, stop-request file, and the decoding that tolerates both a half-written final line and a line it cannot parse. A display that dies because one line arrived garbled is worse than one that misses a step.
- the supervisor (`src/session/runSupervisor.ts`): relaunches this same CLI as `compassrose run --loop`, carrying `process.execArgv` so a `tsx` session forks a `tsx` child and a compiled one forks node. Polls, animates, and reads keys.
- `renderRunningStep` finally has a caller. It was written during the specification round for a frame that could never animate.
- the child's stdout and stderr are captured and re-emitted through the writer rather than inherited: raw output landing straight on stdout would print into the middle of the frame being redrawn.
- `tests/runSupervision.test.ts`: 11 tests, including a real child process observed while it runs (asserting the parent ticked more than once, which is the entire point) and the two-press stop through a fake TTY, tree kill included.

### Verified by hand as well as by test

Two things typechecking cannot show, checked against a throwaway repository: the default spawn
really does relaunch this CLI under the tsx loader and pass its own preflight, and the parent's
event loop keeps turning — it ticked 24 times while the child ran. Then `/run` in a real piped
session, end to end.

## Remaining Deliverables

- the failure explanation itself, which is generated by `026-conversational-doctor-recovery`
- the session forwards every line the child prints, including raw agent output, which is a lot of it during a real implementer call. That was equally true before the change (it went straight to the terminal), so this is not a regression — but a live view is the place where filtering it starts to matter.

## Outline Progress

- 1. Build the terminal writer and the pure render layer: complete
- 2. Build the session runtime: prompt loop, conversation turns, command registry: complete
- 3. Wire the automated loop into the session with live progress and clean interruption: complete
- 4. Wire failure explanation and follow-up questions into the session: in progress
- 5. Rework CLI dispatch and package scripts around the session as the primary entry point: complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none

## Last Approved Change

The session, its render layer, its command registry, and the reworked CLI dispatch were implemented
directly during the specification round.

## Known Gaps

- `feature.md`'s acceptance criterion "the progress view updates while a step is in flight" is now met. The related expectation that `esc` interrupts a step *in flight* is met only in the hard sense: a single press lands at the next checkpoint, and only a second press stops a step that is already running. Stated rather than glossed, because the difference is the difference between a saved worktree and a half-written one.

## Next Planning Hint

Nothing in this feature is waiting on this feature. What is left belongs to `026` (the failure
explanation) or is a judgment call about how much agent output a live view should show.
