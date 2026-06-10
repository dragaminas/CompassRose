# Runtime Operation Loop Contract

## Purpose

Defines the deterministic runtime loop executed by CompassRose.

This contract tells the runtime:

- what inputs it must load
- how it selects the next feature
- what action is valid for each lifecycle state
- when it must stop

---

## Responsibility

The runtime orchestrates the workflow.

The runtime must:

- read repository-local state
- apply deterministic selection rules
- invoke configured roles and commands
- persist resulting state transitions

The runtime must not:

- use AI to decide workflow transitions
- skip required steps silently
- continue after blocking failures without an explicit policy

---

## Required Inputs

The runtime must load:

- project configuration from `docs/compassrose/CONFIG.md`
- project state from `docs/compassrose/PROJECT_STATE.md`
- feature folders from `docs/features/`
- feature state using `src/contracts/state/feature-state.md`
- planner, implementer, reviewer, task, and correction-task contracts from `src/contracts/`

---

## Deterministic Loop Order

The runtime loop must follow this order:

1. inspect repository and configuration preconditions
2. inspect project state
3. inventory feature folders and derive their effective lifecycle states
4. select the next feature by numeric order and lifecycle state
5. formalize the feature when required
6. generate exactly one task when required
7. run implementation when allowed
8. run quality gates
9. run or skip review according to policy
10. persist feature and project state updates
11. stop or continue according to execution mode and limits

The runtime must not reorder these steps.

---

## Preconditions

Before selecting work, the runtime must validate:

- the project configuration can be parsed
- the current platform is supported
- the repository is available
- the worktree policy in `git_policy` is satisfied
- required role adapters are enabled for the requested action
- configured commands required for the next step exist or are intentionally empty

If preconditions fail, the runtime must stop before feature selection.

---

## Feature Inventory

For each numbered feature folder, the runtime must derive one effective state:

- `request_pending` when `request.md` exists and one or more formalized files are missing
- otherwise the value of `## Lifecycle State` in `state.md`

The runtime must treat malformed feature folders as blocking errors for that feature.

---

## Feature Selection Rules

Selection must be deterministic.

Rules:

1. Order features by numeric prefix ascending.
2. Ignore features in `completed`.
3. Select the first feature that is not `completed`.
4. If the selected feature is `blocked`, stop the run and report the blocker.
5. Do not skip an earlier pending feature to work on a later one.

This creates a strict feature-first execution policy for the MVP.

---

## Action By Lifecycle State

### request_pending

Action:

- formalize the request into `feature.md`, `architecture.md`, and `state.md`

Next state:

- `formalized`
- or `formalization_pending` if formalization started but did not finish cleanly

### formalization_pending

Action:

- resume or repeat formalization

### formalized

Action:

- transition to `task_planning_pending`

### task_planning_pending

Action:

- invoke the planner to generate exactly one task

Next state:

- `task_ready`
- or `blocked` if planning cannot produce a valid task

### task_ready

Action:

- execute the recorded task if the execution mode allows it

Next state:

- `implementation_running`

### implementation_running

Action:

- wait for implementation completion or recover the interrupted implementation state

Next state:

- `quality_gates_pending`
- `implementation_failed`
- `blocked`

### quality_gates_pending

Action:

- run effective quality gates in deterministic order

Next state:

- `review_pending` when required gates pass
- `quality_failed` when a required gate fails

### review_pending

Action:

- apply review policy
- run review when required
- record skipped review explicitly when allowed

Next state:

- `completed` when accepted work satisfies the feature
- `formalized` when accepted work advances the feature but does not complete it
- `correction_pending` when review returns changes required
- `review_failed` when the review step itself fails
- `blocked`

### correction_pending

Action:

- execute the recorded correction task instead of generating a broader replacement task

Next state:

- `implementation_running`

### implementation_failed
### quality_failed
### review_failed

Action:

- stop the run unless an explicit recovery policy transitions the feature back into a valid pending state

### blocked

Action:

- stop and surface the blocker

### completed

Action:

- do not select the feature for more work

---

## Task Planning Rules

When planning:

- generate exactly one task
- use the selected feature only
- respect `src/contracts/planner/input.md`
- respect `src/contracts/planner/output.md`
- treat `state.md` as runtime reality
- do not create a backlog

If a correction task is active, the runtime must prefer it over generating a new normal task.

---

## Implementation Rules

When executing implementation:

- use the configured implementer role
- respect allowed and forbidden paths from the active task
- capture raw output
- capture changed files
- capture Git diff

The implementation step must not decide task approval.

---

## Quality Gate Rules

Quality gates are independent from review.

The runtime must:

- resolve effective gate configuration using configuration precedence
- execute required gates before review
- record each gate result separately

If `limits.stop_on_quality_gate_failure` is `true`, the runtime must stop immediately on required gate failure.

---

## Review Rules

Review behavior depends on `review_policy.mode`:

- `required`: review must run
- `optional`: review may be skipped, but the skip must be recorded explicitly
- `disabled`: review is skipped and must still be recorded when configured

The runtime must process only the structured reviewer statuses defined in `src/contracts/reviewer/output.md`.

The reviewer proposes results.
The runtime owns the resulting lifecycle transition.

---

## State Update Rules

After an accepted result, the runtime must:

- update the feature `state.md`
- update `docs/compassrose/PROJECT_STATE.md` when project-wide reality changed

The runtime must not:

- update feature or project state as if work were accepted when review or quality gates failed
- treat planned work as implemented reality

Narrative sections must describe repository reality.
Operational sections must reflect the chosen lifecycle transition.

---

## Stop Conditions

The runtime must stop when:

- configuration preconditions fail
- the selected feature is blocked
- formalization fails
- task planning fails
- implementation fails
- a required quality gate fails and policy requires stopping
- review fails
- a correction iteration would exceed configured limits
- the current execution mode requires human approval before continuing
- there is no selectable feature remaining

---

## Recovery After Interruption

Recovery must be deterministic.

On restart, the runtime must:

1. reload project and feature state
2. re-derive the selected feature
3. inspect its lifecycle state
4. resume the recorded pending step when possible

The runtime must not silently discard:

- an active task
- a correction task
- a failed quality gate result
- a recorded blocker

---

## Execution Modes

The runtime must interpret `execution.mode` using these values:

- `interactive`
- `semi_automatic`
- `automatic`

Mode behavior:

- `interactive`: require human confirmation before task execution and before continuing after accepted review
- `semi_automatic`: continue through safe deterministic steps, but stop at explicit review or completion decision points
- `automatic`: continue until completion, failure, blocker, or configured limit

Execution mode changes whether the runtime pauses.
It does not change the ordering of the loop.
