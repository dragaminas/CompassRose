# Architecture: Runnable Application Gate

## Configuration Shape

```yaml
smoke:
  command: npm run app -- doctor
  expect:
    exit_code: 0
    stdout_contains: "Status: OK"
  timeout_seconds: 60
```

Or, for a service:

```yaml
smoke:
  command: npm start
  expect:
    http_ok: "http://localhost:3000/health"
  timeout_seconds: 60
```

Or, explicitly opting out:

```yaml
smoke:
  none: "Library with no entry point; correctness is covered entirely by its test suite."
```

`expect` may carry any combination of `exit_code`, `stdout_contains`, and `http_ok`; all present
conditions must hold. `none` requires a reason string, matching the discipline applied to discarded
dimensions in `024-specification-flow` — an opt-out without a reason is refused by the validator.

## Two Process Shapes, One Runner

The distinction is not "CLI versus server" but **whether the command is expected to exit**:

- **Exits** — `exit_code` and/or `stdout_contains` are declared, `http_ok` is not. The runner waits
  for exit within the timeout and evaluates the conditions against the result.
- **Stays up** — `http_ok` is declared. The runner starts the process, polls the endpoint until it
  answers or the timeout expires, then terminates the process. `stdout_contains` may accompany it
  and is evaluated against output captured up to that point.

Declaring `http_ok` alongside a command that exits immediately is a legitimate failure: the endpoint
will not answer, and the evidence says so.

## Teardown

The single hardest requirement, and the one most likely to be got wrong: **nothing the gate starts
may outlive it.** A leaked server process holds a port and breaks every subsequent run on the
machine, including the developer's own.

- the process is spawned detached into its own process group, so termination reaches its children
- teardown runs in a `finally`, covering success, failure, timeout, and exception alike
- termination escalates: a graceful signal first, then a forced kill after a short grace period
- on Windows, where signals do not propagate to a process tree, termination goes through `taskkill /T`

Teardown failure is itself reported. Silently failing to kill something is worse than a failed gate.

## Where It Runs

Inside the completion transition owned by `025-automated-development-loop`, as its last condition:

```
outline exhausted
  → all tasks approved?
  → acceptance criteria met?
  → smoke gate passes?           ← this feature
  → mark completed
```

Any failure at the smoke step produces a `blocked` step outcome — the loop's normal
"set aside and continue" path — never a `failed` one. A non-starting application is a fact about
one work item, not a broken engine.

The gate is deliberately absent from the per-task quality gates. Those answer "is this change
correct"; this answers "is the system still alive", which is a question worth asking once per
feature rather than once per task.

## Evidence

Failure evidence reuses the existing `BlockerProfile` shape, with `kind: 'smoke_failure'` and
`recoverability: 'human'`:

- the exact command invoked
- which declared conditions were unmet, and what was observed instead
- the captured output, ANSI-stripped and bounded by the existing `summarizeCommandOutput` clipping

ANSI stripping is not optional here. This repository has already had raw escape sequences written
into a `state.md`, rendering the evidence unreadable; `stripAnsiCodes` in
`implementationDiagnostics.ts` is the existing choke point and this path goes through it.

## Detection Integration

`028-project-understanding` reads declared scripts and proposes start-command candidates — `start`,
`serve`, `dev`, or a `bin` entry. Proposals are surfaced for confirmation and never written to
`CONFIG.md` automatically, consistent with that feature's rule that configuration stays human-owned.

## This Repository's Own Gate

```yaml
smoke:
  command: npm run doctor
  expect:
    exit_code: 0
    stdout_contains: "Status: OK"
  timeout_seconds: 60
```

`doctor` is the right choice: it exercises configuration loading, path resolution, platform
detection, git access, and the report renderer, exits deterministically, and starts nothing that
needs tearing down.

## Constraints

- No new runtime dependencies; `http_ok` uses `node:http`
- Nothing the gate starts may survive it
- A gate failure is always a blocked outcome, never a failed one
- The success condition is declared, never inferred at run time
- An opt-out requires a written reason
