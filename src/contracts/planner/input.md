# Planner Input Contract

## Purpose

Defines the information provided to a Planner role when CompassRose asks for the next task.

The Planner receives intent and current reality.

The Planner returns one task.

---

## Responsibility

The Planner must generate the next atomic, reviewable task for a feature.

The Planner must not generate a long-lived backlog.

---

## Input Sources

The Planner input is assembled by CompassRose from repository documentation and current project state.

Required inputs:

- Roadmap context
- Feature definition
- Feature architecture
- Feature state
- Project state summary
- Project configuration
- Feature configuration, if present
- Relevant repository summary
- Planning rules
- Current execution mode

Optional inputs:

- Recent run summaries
- Known blockers
- User-provided planning hint

---

## Required Shape

```yaml
planner_input:
  run_id: string
  feature_id: string
  feature_name: string

  roadmap_context:
    source: string
    relevant_objectives:
      - string

  feature:
    source: string
    purpose: string
    goals:
      - string
    acceptance_criteria:
      - string
    implementation_deliverables:
      - string
    completion_criteria:
      - string
    implementation_outline:
      - string

  architecture:
    source: string
    relevant_modules:
      - string
    boundaries:
      allowed:
        - string
      forbidden:
        - string
    constraints:
      - string

  state:
    source: string
    status: string
    implemented:
      - string
    pending:
      - string
    outline_progress:
      - string
    known_gaps:
      - string
    blockers:
      - string
    feature_completion_assessment: string

  project_state:
    source: string
    summary: string

  configuration:
    execution_mode: manual | assisted | autonomous
    development_policy: test_guided | implementation_first | documentation_first | strict_tdd
    quality_gates:
      before_review:
        - string
    limits:
      max_files_per_task: number

  repository_context:
    root: string
    relevant_paths:
      - string
    summary: string

  planning_hint: string | null
```

---

## Rules

The Planner must:

- Generate exactly one task.
- Keep the task small.
- Prefer feature-local scope.
- Avoid unrelated refactors.
- Respect allowed and forbidden boundaries.
- Use project state as reality.
- Treat roadmap and feature definitions as intent.
- Use feature deliverables, completion criteria, and outline progress to choose the next meaningful gap.
- Produce a task traceable to a roadmap objective and feature.

The Planner must not:

- Modify documentation.
- Modify code.
- Generate multiple tasks by default.
- Assume future implementation details.
- Ignore known blockers.
- Expand scope beyond the feature unless explicitly allowed.

---

## Output

The Planner must return a document conforming to:

```text
src/contracts/planner/output.md
```
