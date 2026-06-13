# Unblock Task Contract

## Purpose

Defines a bounded task generated when a feature is blocked but the blocker is recoverable.

An unblock task removes a known blocker, tightens the task interface, or restores the surrounding execution conditions so deterministic orchestration can resume.

This shape is distinct from `src/contracts/task/correction-task.md` because it targets blocker recovery, not review findings.

`src/contracts/task/state-correction-task.md` is a specialized unblock task that only repairs malformed state documents.

---

## Responsibility

An unblock task resolves a named blocker without reopening the whole feature.

It preserves the feature's intended execution target and only changes the minimum repository surface needed to resume progress.

---

## Required Shape

```yaml
unblock_task:
  task_id: string
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
    kind: state_corruption | task_interface_gap | cli_mismatch | environment | review_failure | unknown
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
    mode: test_guided | implementation_first | documentation_first | strict_tdd

  quality_gates:
    before_review:
      - string

  acceptance_criteria:
    - string

  expected_deliverables:
    - code
    - tests
    - documentation
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

An unblock task must not:

- Replan the feature from scratch.
- Widen the blocker into a backlog item.
- Solve unrelated issues opportunistically.
- Assume the blocker can be fixed without evidence.

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
