# Proto CompassRose

## Purpose

`proto/protoCompassRose.ts` is an external TypeScript prototype for the CompassRose runtime loop.

It is intentionally outside `src/` because it is a proving ground for orchestration behavior, not yet a product runtime.

## Tools

- `codex exec` determines the next step, plans features, plans tasks, and reviews implementations
- the configured implementer CLI implements tasks and correction tasks
- local shell commands run quality gates
- local Git commands collect changed files, diffs, and commits

## Loop

1. Read `docs/compassrose/CONFIG.md`, `docs/compassrose/PROJECT_STATE.md`, feature state, and runtime contracts.
2. Ask `codex exec` for the next executable step.
3. If the step is `plan_feature`, formalize the feature docs, update feature and project state, and commit.
4. If the step is `plan_task`, generate exactly one task, update feature and project state, and commit.
5. If the step is `unblock_task`, generate exactly one unblock task with the planner-grade `codex` role and its configured default model, update feature and project state, and commit.
6. If the step is `implement_task`, ask the configured implementer CLI to execute the task using TDD.
7. Run quality gates from the task.
8. If the step is `review_task`, ask `codex exec` to review the current Git diff plus quality-gate and implementation artifacts.
9. If the review is `approved`, update feature and project state and commit.
10. If the review is `changes_required`, create a correction task, update state, return rejected, and stop.
11. If the selected feature's state is malformed but repairable, create a state correction task from project/feature hints or recorded task artifacts, update state, and continue.
12. If the step is `correct_task`, ask the configured implementer CLI to execute the correction task using TDD.

Implementation recovery:

- If the implementer CLI collapses but leaves partial repository changes, keep the feature in `implementation_running` and call the implementer again once from the current worktree.
- If the retry succeeds, continue with quality gates and review as usual.
- If the retry also fails, or the implementer produced no repository progress at all, mark the implementation as failed and stop the loop.
- Do not replan the feature while an implementation retry is still available.
- Recovery-style mutating steps should not be rejected just because the worktree is dirty when the dirty paths belong to the active feature's own state or task documents.

Controlled stop:

- `Ctrl-C`, `SIGINT`, and `SIGTERM` request a controlled stop.
- The prototype stops at the next safe checkpoint, writes a `stopped` run summary, and preserves the active feature and task state for the next pass.
- A controlled stop is not a failure transition and should not create a refinement lesson.

## Stop Conditions

The prototype stops when any of these is true:

- there is no non-completed feature left to implement
- the selected feature is blocked and no unblock task can repair it
- the selected feature is malformed and no state correction task can repair it
- implementation fails after the retry budget is exhausted or no recoverable progress exists
- a required quality gate fails
- review cannot proceed because there is no Git diff
- review returns `changes_required`

## TDD Policy

The prototype enforces TDD for implementation work:

- task planning requires `development_policy.mode = test_guided` whenever the task delivers code
- documentation-only unblock tasks may remain `documentation_first`; unblock tasks that deliver code or tests must be planned as `test_guided`
- implementation prompts instruct the implementer to add or adjust the smallest failing test first, then make it pass
- review prompts explicitly check that `test_guided` tasks include meaningful test changes

## Artifacts

Run artifacts are written under `.git/proto-compassrose/` so they do not dirty the working tree:

- `tasks/`
- `diffs/`
- `implementations/`
- `raw-output/`
- `quality-gates/`
- `reviews/`
- `task-interface-analysis/`
- `blockers/`
- `runs/`
- `refinement/`

When a run stops because of a blocker or failure, the prototype also writes a refinement note that points back to the contracts or docs most likely needing improvement.

When the runtime can repair malformed feature state, it writes a state correction task instead of stopping immediately.

When the runtime can recover a blocker, it writes a blocker profile artifact and an unblock task instead of stopping immediately.

When a review diagnoses implementation problems, the prototype also writes a task-interface analysis artifact that distinguishes:

- what could be improved by tightening the task contract
- what should be documented as an implementer limitation

Implementation attempts may also emit concise `Implementation Notes`; the prototype stores them in the implementation artifact and reuses them as reviewer context when the implementer reports that no code changes were needed or that the task was already satisfied.

## State Updates

The prototype updates:

- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/<feature-id>/state.md`
- `docs/features/<feature-id>/tasks/*.md`

Planning and approved review are committed.
Implementation and rejected review update the worktree but do not commit automatically.

## Validation

The prototype has its own typecheck entrypoint:

```bash
npx tsc -p proto/tsconfig.json
```

Typical execution:

```bash
tsx proto/protoCompassRose.ts run
tsx proto/protoCompassRose.ts run --no-commit
tsx proto/protoCompassRose.ts run --loop
tsx proto/protoCompassRose.ts run --loop --implementer codex
```

Optional environment variables:

- `PROTO_COMPASSROSE_CODEX_COMMAND`
- `PROTO_COMPASSROSE_CODEX_MODEL`
- `PROTO_COMPASSROSE_OPENCODE_COMMAND`
- `PROTO_COMPASSROSE_OPENCODE_MODEL`

## Current Limits

- step selection is still delegated to `codex exec`; the final CompassRose runtime should make that transition deterministic in code
- project and feature state are still Markdown documents edited by section replacement; a future deterministic orchestrator will be easier to harden if state also has a machine-readable form
- the prototype assumes review happens against the current worktree diff and stops if there is none

## Feedback To Fold Back Into CompassRose

This prototype already surfaced design pressure that should feed the main project:

- runtime state transitions are easier to automate when state has a machine-readable projection
- implementation adapters need raw output plus normalized diagnostics, not just a diff
- untracked files must be included in review evidence, not only tracked diffs

The prototype now encodes that philosophy directly:

- each run writes a structured run summary
- each failed or blocked run writes a refinement artifact
- each recoverable blocker writes a blocker profile artifact and an unblock task
- each problematic review writes a task-interface analysis artifact
- refinement artifacts connect concrete execution friction back to canonical contracts and docs
- blocker profile artifacts connect observed blocker signatures to learned recovery patterns
- task-interface analysis artifacts connect reviewer findings back to future task design and implementer limits
