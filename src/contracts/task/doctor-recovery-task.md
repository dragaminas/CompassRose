# Doctor Recovery Task Contract

## Purpose

Defines the bounded recovery task executed by the `doctor` role when deterministic orchestration cannot safely continue on its own.

A doctor recovery task may repair repository documentation, state, implementation code, tests, or task interfaces when that is the smallest safe change required to re-enter the deterministic loop.

It is not a feature-planning task, and it does not open a second review loop for the recovery itself.

Pure documentation or state drift that can be repaired directly by the runtime still belongs to `src/contracts/task/state-correction-task.md`.

---

## Responsibility

A doctor recovery task resolves a named blocker without silently redefining the feature plan.

It must preserve blocker evidence, task lineage, and the restoration target that tells the runtime where deterministic execution resumes after the recovery passes its own quality gates.

---

## Required Shape

The task reuses the base task shape from `src/contracts/planner/output.md` and adds these recovery sections in the task document:

```yaml
doctor_recovery:
  executor_role: doctor
  review_policy: no_review_loop

blocker:
  kind: state_corruption | task_interface_gap | cli_mismatch | environment | review_failure | implementation_failure | unknown
  signature: string
  evidence:
    - string
  recoverability: auto | agent | human | terminal
  observed_state: string

restoration_target:
  lifecycle_state: string
  active_task: string
  active_correction_task: string
  active_unblock_task: string
```

The task's `quality_gates.before_review` list is interpreted as the doctor recovery's re-entry gates.

Those gates are the complete gate set for the recovery handoff. They validate the recovery
interface and restoration readiness; they are not inherited from the active implementation task
and must not require that task's unmet implementation acceptance gates before re-entry.

---

## Rules

A doctor recovery task must:

- name the blocker explicitly
- preserve the current task lineage when the failed task must be superseded
- preserve recovery evidence instead of rewriting history
- keep the scope bounded to the blocker and re-entry point
- include a concrete `first_executable_step`
- include `minimum_progress_evidence` that requires real repository change
- make the restoration target explicit, and set `restoration_target.lifecycle_state` to a state that represents forward progress (e.g. `task_ready`) — never the same failed/blocked lifecycle state the blocker was diagnosed from, since restoring into it re-triggers the identical diagnosis on the very next step
- state the doctor executor and `no_review_loop` policy in the task document
- use quality gates that validate re-entry readiness, not reviewer convenience
- give every `quality_gates.before_review` entry as a literal, directly executable shell command (e.g. `npm test`) — the runtime runs each entry verbatim; a natural-language description of what to verify is not a gate and will fail with no output
- preserve `restoration_target.active_task` as the task anchor being resumed, set `active_correction_task` to `none` unless a correction is explicitly part of the restoration target, and clear `active_unblock_task` after the recovery gates pass
- give every `git diff ... --exit-code` gate an explicit ref before the `--` pathspec separator (the commit before the task being recovered began), never a bare comparison against the current worktree/HEAD — HEAD already contains whatever this recovery exists to undo, so a ref-less gate could only ever pass by leaving it untouched; the runtime deterministically rejects a planned recovery task that omits this ref
- keep architecture redesign out of scope unless the diagnostic explicitly says the blocker cannot be repaired otherwise
- use `test_guided` when the recovery changes code or tests
- ground `first_executable_step`, `minimum_progress_evidence`, and `acceptance_criteria` only in artifacts, fields, and mechanisms that already exist in the runtime and its contracts — do not require a manifest, validator, or artifact type that is not implemented, even if a prior recovery lesson suggested one; a task that demands a fictional mechanism can never be satisfied and will keep bouncing between correction and recovery

A doctor recovery task may:

- touch `docs/`, repository state files, `src/`, and tests when needed for the recovery
- revise the failed task interface when that is the actual blocker
- emit a later-version task that points back to the earlier task with `previous_task_id`

A doctor recovery task must not:

- widen into unrelated feature work
- reopen a normal reviewer loop for the recovery itself
- hide stale recovery evidence
- delete or rewrite the earlier failed task instead of linking back to it
- choose a different restoration target without explicit blocker evidence

---

## Lifecycle

```text
Broken Deterministic Flow
    ↓
Diagnostic / Planning
    ↓
Doctor Recovery Task
    ↓
Doctor Execution
    ↓
Doctor Quality Gates
    ↓
Deterministic Re-entry
```
