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
- Feature state normalized through `src/contracts/state/feature-state.md`

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
    lifecycle_state: formalization_pending | formalized | task_planning_pending | task_ready | implementation_running | implementation_failed | quality_gates_pending | quality_failed | review_pending | review_failed | correction_pending | blocked | completed
    operational_status:
      formalization: complete | not_started
      active_task: string | none
      active_correction_task: string | none
      last_implementation_result: not_run | passed | failed
      last_quality_gate_result: unknown | passed | failed | skipped
      last_review_result: not_run | approved | changes_required | blocked | failed | skipped
    implemented_deliverables:
      - string
    remaining_deliverables:
      - string
    outline_progress:
      - string
    known_gaps:
      - string
    blockers:
      - string
    next_planning_hint: string | null

  project_state:
    source: string
    summary: string

  configuration:
    execution_mode: interactive | semi_automatic | automatic
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
- Use lifecycle state plus feature deliverables, remaining deliverables, and outline progress to choose the next meaningful gap.
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
