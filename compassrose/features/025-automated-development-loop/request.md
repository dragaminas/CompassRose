# Request: Automated Development Loop

I want an automated flow that iterates Planning → Implementation → Review over features and bugs
that are documented and validated by a specification.

Once the specification is given, the rest of development should be an iteration that ideally ends
with a running application. I should not have to keep pace with it.

Most of this exists already. Four things about it do not match what I want:

- **One blocked item stops everything.** `run()` returns on any non-zero step, so a single blocked
  feature parked the nineteen behind it for weeks. A blocked item is a normal outcome and should be
  set aside, not treated as a fatal error. A genuine engine failure — a broken contract, a dirty
  worktree — is different and should stop the run.
- **I cannot point it at something.** The priority order is fixed and the only way to change what it
  works on is renaming folders.
- **It cannot finish a feature.** When a feature's plan is exhausted with everything approved, the
  loop only knows how to ask for more task requests. The one completed feature in this repository
  was marked completed by hand.
- **The git history reads as telemetry.** Every internal step leaves its own `proto:` commit, so the
  actual work is buried under bookkeeping.

## Origin

Specified jointly with the user in the specification round of 2026-08-22. Absorbs requests
`008-feature-centric-planning`, `009-task-model`, `012-implementation-runner`, `013-quality-gates`,
`014-git-integration`, `015-review-runner`, `016-correction-task-flow`,
`017-workflow-state-machine`, `018-deterministic-orchestration-loop`, and the execution-mode portion
of `019-autonomous-execution-modes`.
