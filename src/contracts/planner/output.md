# Planner Output Contract

## Purpose

Defines the task produced by a Planner role.

The Planner output becomes the task input for the Implementer and the review reference for the Reviewer.

---

## Responsibility

The Planner must produce one atomic task.

The output must be specific enough for implementation and review.

---

## Required Shape

```yaml
planner_output:
  task:
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

## Required Fields

Every task must include:

- `task_id`
- `feature_id`
- `title`
- `objective`
- `first_executable_step`
- `minimum_progress_evidence`
- `trace`
- `scope.allowed_paths`
- `acceptance_criteria`

---

## Rules

The task must:

- Be independently reviewable.
- Fit within configured task limits.
- Reference one feature.
- Define clear acceptance criteria.
- Define allowed and forbidden paths.
- Include enough context to avoid repository-wide exploration.
- Include a concrete first executable step that can begin the task without interpretation.
- Include minimum progress evidence that proves the implementation moved beyond reading.

The task must not:

- Contain vague goals.
- Combine unrelated features.
- Require large-scale refactoring unless explicitly requested.
- Depend on unstated assumptions.
- Ask the implementer to decide architecture outside the task scope.
- Assume why a previous implementer stopped without producing code.

---

## Status

Planner output is not project state.

Planner output is a temporary execution artifact.
