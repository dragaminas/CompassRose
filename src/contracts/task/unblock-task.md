# Unblock Task Contract

## Purpose

Defines a bounded task generated when a feature is blocked but the blocker is recoverable.

An unblock task removes a known blocker, tightens the task interface, or recovers a failed implementation attempt so deterministic orchestration can resume.

Pure documentation or state drift is not an unblock task; those repairs belong to `src/contracts/runtime/diagnostic-autocorrection.md` via `correct_state`.

This shape is distinct from `src/contracts/task/correction-task.md` because it targets blocker recovery, not review findings.

`src/contracts/task/state-correction-task.md` is the runtime-applied state repair artifact for malformed state documents.

---

## Responsibility

An unblock task resolves a named blocker without reopening the whole feature.

It preserves the feature's intended execution target and only changes the minimum repository surface needed to resume progress.
When the blocker is a stale recovery interface, the unblock task must preserve the current active task anchor and the previous implementation-failure lesson instead of inventing a new task anchor.

---

## Required Shape

```yaml
unblock_task:
  task_id: string
  previous_task_id?: string | null
  feature_id: string
  title: string
  objective: string
  first_executable_step: string
  minimum_progress_evidence:
    - string

  trace:
    roadmap_objective: string
    feature_goal: string
    state_gap: string

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

  context:
    summary: string
    relevant_paths:
      - string
    relevant_modules:
      - string

  scope:
    allowed_paths:
      - string
    forbidden_paths:
      - string

  constraints:
    - string

  development_policy:
    mode: test_guided

  quality_gates:
    before_review:
      - string

  acceptance_criteria:
    - string

  expected_deliverables:
    - code
    - tests
```

---

## Rules

An unblock task must:

- Name the blocker explicitly.
- Record the observed blocker signature and evidence.
- State the lifecycle state to restore after the unblock task is approved.
- Stay within bounded scope.
- Include a concrete `first_executable_step`.
- Include `minimum_progress_evidence` that cannot be satisfied by reading alone.
- When the blocker is an `implementation_failure`, preserve the active task anchor and make the recovery path explicit instead of reopening the whole feature backlog.
- When `blocker.kind` is `task_interface_gap`, record the stale interface markers, the observed state, and the prior attempt evidence that explains why the interface is stale.
- Preserve the current active task anchor verbatim when the source state still contains one; do not mint a synthetic suffix such as a new `-C3` variant.
- If the blocker is a stale recovery interface, make the restoration target explicit in the task text and do not replace it with a future-state guess.
- If the unblock task is a later version of a previous task, set `previous_task_id` to that earlier task and keep the earlier task as historical evidence instead of rewriting it.
- If the blocker is a design or implementation interface gap, keep the task source-only: limit `scope.allowed_paths` to implementation code under `src/` and any necessary tests, and keep repository documentation, contract markdown, and state files in `scope.forbidden_paths`.
- If the blocker is pure documentation or state drift, do not generate an unblock task; use `correct_state` instead.
- Keep `expected_deliverables` aligned with `development_policy.mode`.
- If the unblock task needs code or tests, it must be planned as `test_guided`.
- Keep `quality_gates.before_review` runnable in a plain shell on the target runtime.
- Prefer portable commands that are expected to exist in the runtime environment.
- Do not require optional tools unless the unblock context explicitly states they are available.

An unblock task must not:

- Replan the feature from scratch.
- Widen the blocker into a backlog item.
- Solve unrelated issues opportunistically.
- Assume the blocker can be fixed without evidence.
- Invent a new task anchor or restoration target when the blocker evidence already names the current one.
- Delete or rewrite the earlier task artifact instead of linking the new version to it.
- Modify repository documentation or state files when the blocker is a design or implementation interface gap and the unblock task is meant to repair source behavior.

---

## Lifecycle

```text
Blocked Feature
    ↓
Unblock Task
    ↓
Implementation
    ↓
Review
    ↓
Restored Feature State
```
