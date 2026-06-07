# Correction Task Contract

## Purpose

Defines a correction task generated after a review finds issues.

A correction task is a task with a narrower scope.

This shape may appear as a standalone task artifact or inline inside reviewer output.

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

A correction task must not:

- Add unrelated improvements.
- Redesign the feature.
- Expand the roadmap.
- Replace the original task with a broader task.

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
