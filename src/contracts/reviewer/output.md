# Reviewer Output Contract

## Purpose

Defines the structured result produced by a Reviewer role.

---

## Status Values

Allowed statuses:

```text
approved
changes_required
blocked
failed
```

---

## Required Shape

```yaml
reviewer_output:
  task_id: string
  status: approved | changes_required | blocked | failed

  summary: string

  acceptance:
    criteria:
      - criterion: string
        status: passed | failed | not_verified
        notes: string

  findings:
    - severity: info | warning | error | blocker
      message: string
      path: string | null
      related_acceptance_criterion: string | null

  scope_check:
    status: passed | failed
    unrelated_changes:
      - string

  quality_gate_check:
    status: passed | failed | skipped
    failed_gates:
      - string

  correction_task: null | object
  project_state_update_hint: string | null
```

When `correction_task` is not `null`, it must conform to:

```yaml
correction_task:
  parent_task_id: string
  correction_task_id: string
  feature_id: string
  title: string
  objective: string

  review_findings:
    - string

  scope:
    allowed_paths:
      - string
    forbidden_paths:
      - string

  constraints:
    - string

  acceptance_criteria:
    - string

  quality_gates:
    before_review:
      - string
```

---

## Status Semantics

### approved

The implementation satisfies the task.

### changes_required

The implementation is close but requires correction.

A correction task should be provided.

### blocked

The task cannot proceed due to missing information, broken environment, external dependency, or architectural conflict.

### failed

The implementation attempt is invalid or unusable.

---

## Rules

If status is `approved`:

- No blocking findings are allowed.
- Mandatory quality gates must pass unless explicitly skipped by policy.
- `correction_task` must be null.

If status is `changes_required`:

- Findings must explain what failed.
- `correction_task` must be present.
- The correction task must be narrower than the original task.
- The correction task must conform to `src/contracts/task/correction-task.md`.

If status is `blocked`:

- The blocking condition must be explicit.
- No correction task is required.

---

## Output Is Not State

Reviewer output does not directly update project state.

The orchestrator decides how to apply the result.
