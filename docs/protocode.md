# Proto CompassRose

## Purpose

`proto/protoCompassRose.ts` is an external TypeScript prototype for the CompassRose runtime loop.

It is intentionally outside `src/` because it is a proving ground for orchestration behavior, not yet a product runtime.

## Tools

- `codex exec` determines the next step, plans features, plans tasks, and reviews implementations
- `opencode run` implements tasks and correction tasks
- local shell commands run quality gates
- local Git commands collect changed files, diffs, and commits

## Loop

1. Read `docs/compassrose/CONFIG.md`, `docs/compassrose/PROJECT_STATE.md`, feature state, and runtime contracts.
2. Ask `codex exec` for the next executable step.
3. If the step is `plan_feature`, formalize the feature docs, update feature and project state, and commit.
4. If the step is `plan_task`, generate exactly one task, update feature and project state, and commit.
5. If the step is `implement_task`, ask `opencode run` to execute the task using TDD.
6. Run quality gates from the task.
7. If the step is `review_task`, ask `codex exec` to review the current Git diff plus quality-gate and implementation artifacts.
8. If the review is `approved`, update feature and project state and commit.
9. If the review is `changes_required`, create a correction task, update state, return rejected, and stop.
10. If the step is `correct_task`, ask `opencode run` to execute the correction task using TDD.

## Stop Conditions

The prototype stops when any of these is true:

- there is no non-completed feature left to implement
- the selected feature is blocked
- implementation fails
- a required quality gate fails
- review cannot proceed because there is no Git diff
- review returns `changes_required`

## TDD Policy

The prototype enforces TDD for implementation work:

- task planning requires `development_policy.mode = test_guided` whenever the task delivers code
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
