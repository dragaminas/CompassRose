# Correction Task Contract

## Purpose

Defines a correction task generated after a review finds issues.

A correction task is a task with a narrower scope.

This shape may appear as a standalone task artifact or inline inside reviewer output.

State repairs are modeled separately in `src/contracts/task/state-correction-task.md`.

---

## Responsibility

A correction task addresses review findings without reopening the full original task.

---

## Required Shape

```yaml
correction_task:
  parent_task_id: string
  correction_task_id: string
  feature_id: string
  title: string
  objective: string
  first_executable_step: string
  minimum_progress_evidence:
    - string

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

## Rules

A correction task must:

- Reference the parent task.
- Address specific review findings.
- Be smaller than the original task.
- Avoid introducing new scope.
- Preserve original intent.
- Include a concrete `first_executable_step`.
- Include `minimum_progress_evidence` that cannot be satisfied by reading alone.
- Give every `quality_gates.before_review` entry as a literal, directly executable shell command (e.g. `npm test`) — the runtime runs each entry verbatim; a natural-language description of what to verify is not a gate and will fail with no output.
- Ground `first_executable_step`, `minimum_progress_evidence`, and `acceptance_criteria` only in artifacts, fields, and mechanisms that already exist in the runtime and its contracts — do not require a manifest, validator, or artifact type that is not implemented; a correction that demands a fictional mechanism can never be satisfied and will keep generating further corrections instead of converging.

A correction task must not:

- Add unrelated improvements.
- Redesign the feature.
- Expand the roadmap.
- Replace the original task with a broader task.
- Assume why a previous implementer stopped without producing code.

---

## Lifecycle

```text
Original Task
    ↓
Implementation
    ↓
Review
    ↓
Changes Required
    ↓
Correction Task
    ↓
Implementation
    ↓
Review
```
