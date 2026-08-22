# State: Runnable Application Gate

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- active_unblock_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- last_unblock_result: not_run
- validation: confirmed

## Current Reality

Specified jointly with the user in the specification round of 2026-08-22; every product and
architecture decision in `feature.md` and `architecture.md` was made by the user, with contracts,
schemas, and implementation detail filled in by the agent.

Nothing exists. The configured quality gates run typecheck, tests, lint, and build; all four pass
happily on an application that does not start.

This feature depends on the completion transition that `025-automated-development-loop` introduces --
there is currently no point in the runtime where a feature is marked completed, so there is nowhere
for this gate to attach.

## Implemented Deliverables

- the `smoke` configuration block (`SmokeSection`) and its validation: command-with-conditions and opt-out-with-reason are mutually exclusive, an opt-out without a reason is refused, and `expect` must declare at least one condition.
- the three success-condition evaluators (`exit_code`, `stdout_contains`, `http_ok`); all declared conditions must hold, and each unmet one states what was expected and what was observed.
- the gate runner (`src/orchestrator/smokeGate.ts`), synchronous throughout to match the rest of the orchestrator, with a declared timeout and teardown that runs on success, failure, timeout, and exception alike.
- the `smoke_failure` blocker kind, so a start failure is not confused with an implementation failure: the change may be exactly what the task asked for and the application still not come up.
- integration into the completion transition as its last condition, producing a `blocked` outcome — so the run sets that feature aside and carries on.
- a recorded skip: "we did not check" and "we checked and it started" do not read the same way in the closing record.
- this repository's own `smoke` block: `npm run doctor`, expecting exit 0 and `Status: OK`.
- `tests/smokeGate.test.ts`: 11 tests including the teardown one that starts a real server twice on the same port.

### Two real bugs the tests caught

`spawnSync`'s own `timeout` was the obvious way to bound a command expected to exit. It is wrong on
Windows: with `shell: true` it kills the intermediate `cmd.exe` and leaves the actual process
running — precisely the leak this feature exists to prevent. The test noticed because the leaked
process kept holding its working directory after the gate had returned.

Recovering the exit code turned out to be its own problem. The gate is synchronous by necessity, and
Node cannot observe a child's exit code without turning the event loop; asking the shell to write it
does not work on Windows, where `%ERRORLEVEL%` is expanded when the line is *parsed*. Both are solved
by the same small Node wrapper: it runs the command, records the exit code and output to files, and —
being alive and holding the shell as its child — makes `taskkill /T` reach the whole tree.

## Remaining Deliverables

- start-command candidate proposal in project detection, which belongs to `028-project-understanding`

## Outline Progress

- 1. Add the `smoke` configuration block, its schema, and its validation: complete
- 2. Implement the three success-condition evaluators: complete
- 3. Implement the gate runner with timeout and guaranteed teardown: complete
- 4. Wire the gate into the completion transition and the blocked-on-failure path: complete
- 5. Add the skip declaration, and start-command candidate proposal in project detection: in progress

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none
- active_unblock_task: none

## Last Approved Change

Formalized and validated in the specification round of 2026-08-22.

## Known Gaps

- None recorded yet; this feature has not been implemented.

## Next Planning Hint

Implement the configuration block and the evaluators first, and attach the gate once `025-automated-development-loop`'s completion transition exists.
