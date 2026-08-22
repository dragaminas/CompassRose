# Request: Runnable Application Gate

The whole point of the automated loop is that, once the specification is given, the iteration ends
with a running application. Nothing currently checks that.

The quality gates run typecheck, tests, lint, and build. All four can pass on an application that
does not start. "It compiles and its tests pass" is not "it runs".

What I want:

- **A declared start command and a declared success condition.** The project configuration says how
  the application is started and how you know it started — an exit code, expected text in the
  output, or a port that answers. That covers a CLI, a server, and a plain process with the same
  mechanism, and it keeps the definition of "done" out of the model's judgment.
- **Checked when a feature closes, not on every task.** It is expensive, and what it verifies is
  that the system is still alive, not that one particular task was correct — the per-task gates
  already cover that.
- **A failure blocks the feature, not the run.** The approved work stays; the feature simply does
  not become completed. It is blocked with the start failure as its evidence, the run continues with
  something else, and the unblocking conversation is available when I want it.

## Origin

Specified jointly with the user in the specification round of 2026-08-22, from the coverage report
of that round: this dimension was uncovered by all six features and follows directly from the stated
goal that the iteration "ideally ends with a running application".
