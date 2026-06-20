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

## AI Boundary

The runtime must keep workflow control deterministic.

AI may be used only for:

- feature planning
- task planning
- review
- diagnostic/autocorrection when the repository is blocked, malformed, or otherwise not recoverable through deterministic rules alone

AI must not be used for:

- per-step workflow selection
- lifecycle-state decoding when repository state is already valid
- choosing between equivalent deterministic transitions
- silently redefining repository contracts

---

## Required Inputs

The runtime must load:

- project configuration from `docs/compassrose/CONFIG.md`
- project state from `docs/compassrose/PROJECT_STATE.md`
- feature folders from `docs/features/`
- feature state using `src/contracts/state/feature-state.md`
- planner, implementer, reviewer, task, correction-task, state-correction-task, and unblock-task contracts from `src/contracts/`

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

## Invariant Core And Configurable Policy

CompassRose must split repository behavior into:

- invariant contracts owned by `src/contracts/`
- configurable policy owned by `docs/compassrose/CONFIG.md`

Contracts own:

- lifecycle states and their meanings
- step ordering and recovery semantics
- task and review artifact shapes
- blocker, correction, and unblock semantics
- stop conditions that protect deterministic execution

Configuration owns:

- execution mode
- enabled roles and adapters
- command wiring
- review policy
- quality-gate profiles
- retry and run limits

Configuration must not redefine contract enums, artifact shapes, or lifecycle semantics.

If a recovery path needs to change those invariants, it is an interface change and must be treated as contract work rather than a simple config tweak.

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
4. If the selected feature's state is malformed but repairable, generate a state correction task and transition the feature to `correction_pending`.
5. If the selected feature is `blocked` for a recoverable reason, generate an unblock task with the planner-grade role and transition the feature to `unblock_pending`.
6. If the selected feature is `blocked` for an unrecoverable reason, stop the run and report the blocker.
7. Do not skip an earlier pending feature to work on a later one.

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

### unblock_pending

Action:

- execute the recorded unblock task if the execution mode allows it

Next state:

- `implementation_running`

### implementation_running

Action:

- wait for implementation completion or recover the interrupted implementation state
- if the operator requests a controlled stop, preserve the current active task and stop at the next safe checkpoint instead of converting the feature to a failure state
- if the implementer collapses after producing partial repository changes, retry the same active task once from the current worktree instead of discarding the progress
- if the implementer collapses without producing repository progress, transition explicitly to `implementation_failed` or `blocked` according to the observed diagnostics
- if the implementer produces repository changes without the required implementation notes justification, treat the attempt as failed and preserve that omission in the recovery lesson
- never replan the feature while an implementation retry is still available

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
- this may originate from review findings or from a state-repair task that restored malformed feature state

Next state:

- `implementation_running`

### implementation_failed
### quality_failed
### review_failed

Action:

- if the failed implementation is recoverable, generate a bounded unblock task with the planner-grade role and transition the feature to `unblock_pending`
- otherwise stop the run unless an explicit recovery policy transitions the feature back into a valid pending state
- documentation-only unblock tasks may remain `documentation_first`; unblock tasks that need code or tests must be planned as `test_guided`

### blocked

Action:

- surface the blocker
- if the blocker is recoverable, generate an unblock task with the planner-grade role and transition to `unblock_pending`

Next state:

- `unblock_pending`
- stop when the blocker is unrecoverable

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

If an unblock task is active, the runtime must prefer it over generating a new normal task.

If the selected feature is blocked for a recoverable reason, the runtime must prefer unblock task planning over a normal feature task.

---

## Implementation Rules

When executing implementation:

- use the configured implementer role
- pass the active task's `first_executable_step` to the implementer
- pass the active task's `minimum_progress_evidence` to the implementer
- respect allowed and forbidden paths from the active task
- capture raw output
- capture changed files
- capture Git diff
- capture normalized implementation diagnostics
- preserve each implementation attempt as a separately auditable artifact when recovery or retry is allowed

The implementation step must not decide task approval.

If the implementer collapses but leaves partial repository changes, the runtime must preserve that worktree state, keep the feature in `implementation_running`, and retry the same task once before declaring failure.

If implementation produces no diff, the runtime must preserve the adapter diagnostics and must not assume why the implementer stopped.

If implementation produces no `minimum_progress_evidence`, the runtime must treat the implementation as failed even when the external tool exits successfully.

The runtime must keep enough evidence to distinguish at least:

- context overflow
- provider failure
- permission prompts
- tool refusal
- model passivity
- UI or CLI behavior
- unknown causes

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

If the reviewer reports `blocked`, the runtime must classify whether the blocker is recoverable or terminal:

- recoverable blockers must be persisted as explicit blocker state and may continue into `unblock_pending` planning
- blockers that require human intervention or are terminal must be persisted as explicit blocker state and stop the run
- the blocker record must preserve enough evidence to decide whether the task interface should be tightened or the limitation should be documented

If review returns `changes_required` and produces a correction task, the runtime must treat that result as a recoverable correction transition:

- persist the correction as an explicit recovery lesson
- keep the feature in `correction_pending`
- continue into the recorded correction task when loop execution is allowed
- carry the recovery lesson forward so later planning can tighten the task interface or document an implementer limitation

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
- the selected feature is malformed and no state correction task can repair it
- the selected feature is blocked and no unblock task can repair it
- the reviewer reports a blocked result that is terminal or requires human intervention
- formalization fails
- task planning fails
- implementation fails
- a required quality gate fails and policy requires stopping
- review fails
- a correction iteration would exceed configured limits
- the current execution mode requires human approval before continuing
- the operator requests a controlled stop (`SIGINT` or `SIGTERM`); the runtime must preserve the current checkpoint and record the run as `stopped` instead of synthesizing a failure transition
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
- partial implementation progress captured in the worktree or diff
- a recorded recovery lesson

Implementation recovery rules:

- `implementation_running`: inspect the latest implementation artifacts first
- if the latest attempt left partial repository changes, retry the same active task once from the current worktree
- if the retry succeeds, continue to quality gates
- if the retry also fails or no recoverable progress exists, transition explicitly to `implementation_failed` or `blocked`
- preserve raw output, diff, and diagnostics for both the failed attempt and the retry so the operator can distinguish a transient collapse from a terminal stop
- `implementation_failed`: inspect the latest implementation artifacts first and, when the active task anchor is still recoverable, plan a bounded unblock task that restores task readiness before retrying implementation
- controlled stop is not a failure transition: if the operator interrupts the runtime, keep the current lifecycle state and active task pointers intact so the next run can resume from the recorded checkpoint
- a failed quality gate result
- a recorded blocker
- implementation diagnostics from an interrupted or empty attempt

Correction recovery rules:

- `correction_pending`: inspect the recorded correction task before selecting new work
- if a review requested changes and a correction task was produced, continue into that correction task instead of forcing a manual restart
- preserve the corresponding recovery lesson so future task planning can reuse the tighter interface or limitation note
- planning-style recovery steps that only update repository state or task documents should checkpoint those changes when commit policy is active, so the next pass resumes from a clean transition point
- implementation and correction execution may resume from a dirty worktree when that dirty diff is the active task's own partial progress; do not reject the recovery path solely because the worktree is not clean

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
