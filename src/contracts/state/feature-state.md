# Feature State Contract

## Purpose

Defines the operational state that CompassRose reads from a feature's `state.md`.

The contract separates:

- runtime-decisive fields
- human-facing descriptive fields

This allows `state.md` to remain readable while still serving as a deterministic runtime input.

---

## Responsibility

CompassRose uses this contract to decide what action is allowed next for a feature.

The orchestrator owns lifecycle transitions.
Narrative sections describe repository reality, but they do not override the lifecycle state.

---

## Repository-Derived Pending Request State

`request_pending` is a repository-derived state, not a `state.md` value.

A feature is in `request_pending` when:

- `request.md` exists
- one or more required formalized feature files are missing

Required formalized files:

- `feature.md`
- `architecture.md`
- `state.md`

Once `state.md` exists, the feature lifecycle must be represented through `## Lifecycle State`.

---

## Runtime Source of Truth

The runtime may use only these sections for deterministic decisions:

- `## Lifecycle State`
- `## Operational Status`
- `## Blocked By`
- `## Blocked From`

The runtime may use these sections as supporting context, but not as the primary transition key:

- `## Current Reality`
- `## Implemented Deliverables`
- `## Remaining Deliverables`
- `## Outline Progress`
- `## Known Gaps`
- `## Last Approved Change`
- `## Next Planning Hint`

---

## Required Markdown Shape

```markdown
# State: <Feature Name>

## Lifecycle State

formalized

## Source Request

`request.md`

## Operational Status

- formalization: complete | not_started
- active_task: none | <task-id>
- active_correction_task: none | <correction-task-id>
- active_unblock_task: none | <unblock-task-id>
- last_implementation_result: not_run | passed | failed
- last_quality_gate_result: unknown | passed | failed | skipped
- last_review_result: not_run | approved | changes_required | blocked | failed | skipped
- last_unblock_result: not_run | passed | failed | skipped

## Current Reality

<Describe what currently exists in the repository for this feature.>

## Implemented Deliverables

- <Implemented deliverable 1>

## Remaining Deliverables

- <Remaining deliverable 1>

## Outline Progress

- <Implementation outline step 1>: not started | in progress | complete

## Blocked By

- None

## Blocked From

- lifecycle_state: none | <suspended-lifecycle-state>
- active_task: none | <task-id>
- active_correction_task: none | <correction-task-id>
- active_unblock_task: none | <unblock-task-id>

## Last Approved Change

None

## Known Gaps

- <Gap 1>

## Next Planning Hint

<Optional hint for the planner about what should probably come next.>
```

---

## Allowed Lifecycle States

States recorded in `## Lifecycle State`:

- `formalization_pending`
- `formalized`
- `task_planning_pending`
- `task_ready`
- `implementation_running`
- `implementation_failed`
- `quality_gates_pending`
- `quality_failed`
- `review_pending`
- `review_failed`
- `correction_pending`
- `unblock_pending`
- `blocked`
- `completed`

Repository-derived state:

- `request_pending`

---

## Lifecycle Semantics

### formalization_pending

The feature request has been selected for formalization, but the canonical feature documents are not yet complete or must be regenerated.

### formalized

The canonical feature documents exist and no active task is ready yet.
The next valid action is usually task planning.

### task_planning_pending

The feature is the active planning target and CompassRose must generate exactly one task.

### task_ready

A task already exists and may be executed when the current execution mode allows it.

### implementation_running

An implementation attempt is in progress or must be explicitly recovered after interruption.
If the last attempt left partial repository changes, the runtime should retry the same active task once from the current worktree before declaring failure.
The feature remains in `implementation_running` while that retry budget is still available.
A controlled stop does not convert the feature to `implementation_failed` or `blocked`; it preserves the recorded active task and leaves the feature ready to resume from the checkpoint on the next run.

### implementation_failed

The last implementation attempt failed and the runtime must either plan a bounded doctor recovery task that restores the recorded active task or require explicit recovery before continuing.

### quality_gates_pending

Implementation output exists and required quality gates must run before review.

### quality_failed

At least one required quality gate failed.

### review_pending

Quality-gated implementation output exists and is waiting for review.

### review_failed

The review step failed to produce a valid result or reported an unrecoverable failure.

### correction_pending

A reviewer requested a bounded correction task, or the runtime generated a state repair task, and that correction task is now the active execution target.

### unblock_pending

This compatibility state records that a bounded doctor recovery task is now the active execution target.
After the doctor quality gates pass, the runtime restores the captured lifecycle state and clears `active_unblock_task`.

### blocked

The feature cannot advance because of an explicit blocker recorded in `## Blocked By`.
The suspended execution target to resume later is recorded in `## Blocked From`.

### completed

The feature is complete and should not be selected for new work.

---

## Transition Rules

Allowed high-level transitions:

```text
request_pending
    -> formalization_pending
    -> formalized
    -> task_planning_pending
    -> task_ready
    -> implementation_running
    -> implementation_failed
    -> blocked

task_ready
    -> implementation_running
    -> blocked

implementation_running
    -> quality_gates_pending
    -> implementation_failed
    -> blocked

quality_gates_pending
    -> review_pending
    -> quality_failed
    -> blocked

review_pending
    -> completed
    -> correction_pending
    -> review_failed
    -> blocked

correction_pending
    -> implementation_running
    -> blocked

unblock_pending
    -> implementation_running
    -> blocked

implementation_failed
quality_failed
review_failed
    -> unblock_pending
    -> blocked
    -> task_planning_pending
    -> correction_pending

blocked
    -> formalized
    -> task_planning_pending
    -> correction_pending
    -> unblock_pending

completed
    -> completed
```

The orchestrator must not invent transitions outside this contract.

---

## Invariants

- `completed` requires:
  - no remaining deliverables that are still required for the feature
  - `active_task: none`
  - `active_correction_task: none`
- `blocked` requires at least one explicit blocker under `## Blocked By`
- `blocked` requires a suspended execution target under `## Blocked From`
- `task_ready`, `implementation_running`, `quality_gates_pending`, `review_pending`, and `review_failed` require `active_task` to be set
- `correction_pending` requires `active_correction_task` to be set
- `unblock_pending` requires `active_unblock_task` to be set
- `last_review_result: changes_required` must not coexist with `active_correction_task: none`
- `lifecycle_state` is the primary transition key; descriptive sections must not contradict it

---

## Recovery After Interruption

On restart, CompassRose must inspect `## Lifecycle State` first.

Recovery rules:

- `implementation_running`: inspect execution artifacts and either resume the implementation step or transition explicitly to `implementation_failed` or `blocked`
- `implementation_running`: inspect execution artifacts first; if the latest attempt left partial repository changes, retry the same active task once before deciding whether to stop
- `operator-requested stop`: preserve the recorded lifecycle state and active task pointer; do not infer a failure transition from the interrupt alone
- `implementation_failed`: inspect execution artifacts first; if the failed task can be recovered, plan a bounded doctor recovery task and transition to `unblock_pending`
- `quality_gates_pending`: re-run or resume quality gates instead of planning a new task
- `review_pending`: re-run or resume review instead of planning a new task
- `correction_pending`: continue with the recorded correction task instead of generating a broader replacement task
- `unblock_pending`: continue with the recorded doctor recovery task instead of generating a broader replacement task
- `blocked`: recover the blocker explicitly before generating new planning work

CompassRose must prefer explicit recovery over silent state rewriting.
