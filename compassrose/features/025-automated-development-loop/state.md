# State: Automated Development Loop

## Lifecycle State

implementation_running

## Source Request

`request.md`

## Operational Status

- formalization: complete
- active_task: none
- active_correction_task: none
- last_implementation_result: not_run
- last_quality_gate_result: unknown
- last_review_result: not_run
- validation: confirmed

## Current Reality

Specified jointly with the user in the specification round of 2026-08-22; every product and
architecture decision in `feature.md` and `architecture.md` was made by the user, with contracts,
schemas, and implementation detail filled in by the agent.

All four gaps this feature named are closed. A blocked work item is set aside and the run carries
on -- the failure that parked nineteen features behind one for weeks. A run can be targeted at a
single item. The runtime can close a feature whose acceptance criteria it has verified, which no
code path could do before: both `002` and `003` were closed by hand. And one unit of work is now
one commit.

What remains is the structured `RunSummary` for non-interactive callers; the session renders its
own today.

## Implemented Deliverables

- `StepOutcomeKind` (`advanced` / `blocked` / `failed`) on `StepExecutionResult`, replacing the exit-code-only signal. The codebase already had the convention implicitly — `exitCode: 2` meant blocked, `1` meant failed — so making it a required field let the compiler enumerate all 34 return sites rather than leaving them to be found by hand.
- `run()` reworked around the outcome kind: `blocked` sets the item aside and continues, `failed` stops the run.
- a per-run set-aside (`setAsideItemIds`), so an item this run blocked is not immediately re-selected. Cleared at the start of every run, since the interactive session reuses one orchestrator.
- process exit codes that distinguish the three endings: `0` nothing left to do, `3` finished but something needs a human, `1` the engine could not continue.
- an unhandled exception escaping a step now reports and returns `1` instead of rethrowing, which used to kill the process with a raw stack trace and no run summary.
- run targeting: `setRunTarget`, the `--target <id>` flag, and `/run <id>` in the session. Narrows selection and never widens it; refuses an id that does not exist.
- `blockedDuringRun()`, and the session's end-of-run summary built from it.
- `tests/loopOutcome.test.ts`: 8 tests over blocked-continues, failed-stops, exit codes, set-aside, and targeting.

- acceptance-criteria verification (`src/contracts/runtime/acceptance-criteria-verification.schema.json`, `acceptanceCriteria.ts`) returning a per-criterion verdict with evidence rather than one boolean, so a refusal to close names exactly which criteria stand in the way. `unverifiable` counts as unmet: the default is always to leave a feature open.
- the automatic completion transition, `attemptFeatureCompletion`, replacing the old unconditional "formalize additional task requests" block on an exhausted outline. Four preconditions checked in cost order — the cheap deterministic ones first, the AI call last — so a feature that obviously is not finished never pays for one.
- the empty-versus-exhausted distinction: a feature that never declared a task request has completed nothing, and is still told to declare some rather than asked whether it is finished.
- `tests/featureCompletion.test.ts`: 9 tests over closing, refusing to close, and each deterministic precondition short-circuiting the AI call.

- commit batching: planning a task, planning a fix task, and moving a task into implementation no longer commit. The approving review does, once, with the accumulated bookkeeping as the commit body — `proto: complete task F500-T01` followed by `- planned: …`, `- implemented: …`, `- quality gates: …`, `- review: approved`.
- the trail (`src/orchestrator/taskCommitTrail.ts`) is persisted in the artifact store, not held in memory: a task's arc routinely spans more than one run, and an in-memory trail would silently lose whatever happened before the last one. It is recorded under `--no-commit` too, which is exactly the run whose steps would otherwise leave no trace at all. Bounded at 40 rendered entries.
- `tests/commitBatching.test.ts`: 10 tests. Worth noting why they are new rather than adjusted — the entire commit surface had exactly **one** test anywhere in the suite before this, on an unrelated path, so the old per-step behavior was never pinned by anything.

### What batching exposed

Terminal outcomes still commit — correction requested, review blocked, review failed, blocking fix
filed. That is deliberate, not an oversight: the rejected implementer diff is live in the worktree
at those points, and carrying it into the next task would put paths outside that task's own declared
scope in front of its review-time scope check. Only the *bookkeeping* stopped being a commit
boundary, which is what "absorbing the intermediate bookkeeping" means.

Two things the change forced, both real:

`ensureCleanWorktreeIfRequired` allowed dirt under `compassrose/features/<id>` only. Fixes go under
`compassrose/fixes/<id>`, so a fix's own uncommitted state document was a disallowed dirty path the
moment its next task was planned. Latent while planning committed for itself;
`reconcileDirtyPathsForNewScope` had already built the correct pair a few lines away.

`blockOnUnrelatedFixFailure` committed an explicit three-path list. That was right when the only
uncommitted things left were the two state documents and the new fix; the task document is now
uncommitted too, and under neither, so it would have been left dangling to fail the next
clean-worktree check. It sweeps now, which is safe precisely because
`reconcileDirtyPathsForNewScope` has just discarded the abandoned diff.

## Remaining Deliverables

- the structured `RunSummary` model for non-interactive callers (the session renders its own today)
- `git_policy.commit_after_task` is validated by the config reader and read by nothing. It is now directly relevant — this feature is what "commit after task" means — but wiring it would let `manual` stop the loop committing at all, which is a behavior change rather than batching, and this repository's own CONFIG.md declares `manual`. Left for an explicit decision rather than quietly changed.

## Outline Progress

- 1. Introduce the step-outcome distinction and rework `run()` around it: complete
- 2. Add run targeting: complete
- 3. Add acceptance-criteria verification and automatic completion: complete
- 4. Rework committing to one commit per approved task: complete
- 5. Add the end-of-run summary: in progress

## Blocked By

- None

## Blocked From

- lifecycle_state: none
- active_task: none
- active_correction_task: none

## Last Approved Change

Formalized and validated in the specification round of 2026-08-22.

## Known Gaps

- Everything listed under Remaining Deliverables above is a known gap; nothing else has surfaced.

## Next Planning Hint

Add the structured `RunSummary` for non-interactive callers, and decide what `git_policy.commit_after_task` should mean now that one task is one commit.
