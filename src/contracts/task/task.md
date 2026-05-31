# Task Contract

## Purpose

Defines the canonical CompassRose task.

A task is a temporary execution artifact generated on demand.

Tasks are not the long-term planning source.

---

## Responsibility

A task tells the Implementer what to change and tells the Reviewer what to validate.

---

## Required Shape

```yaml
task:
  task_id: string
  feature_id: string
  title: string
  objective: string

  trace:
    roadmap_objective: string
    feature_goal: string
    state_gap: string

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

## Field Semantics

### task_id

Unique identifier for the task within a run or project.

### feature_id

The owning feature.

### objective

The concrete change expected from the task.

### trace

Explains why the task exists.

A task must be traceable to:

```text
Roadmap Objective
    ↓
Feature Goal
    ↓
State Gap
```

### context

Minimal information required to execute the task.

### scope

Defines where the implementer may and may not make changes.

### constraints

Rules that must be respected during implementation.

### development_policy

Defines the implementation style for this task.

### quality_gates

Commands or checks that must run before review.

### acceptance_criteria

Concrete criteria used by the Reviewer.

---

## Rules

A task must:

- Be small.
- Be feature-scoped.
- Be reviewable.
- Be executable by an external tool.
- Contain no hidden requirements.

A task must not:

- Serve as a roadmap.
- Represent a long-term backlog.
- Mix unrelated features.
- Require repository-wide exploration unless explicitly allowed.
