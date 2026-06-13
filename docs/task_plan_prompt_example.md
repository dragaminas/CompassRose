Act as the CompassRose Planner.

Plan the next task for feature `002-configuration-model`.

Read only these inputs:
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/runtime/operation-loop.md`
- `src/cli/main.ts`
- `src/config/`
- `src/doctor/`
- `tests/`

If you inspect a directory, read only the files needed to ground the task.

Execution facts already decided:
- `feature_id`: `002-configuration-model`
- `next_task_id`: `F002-T04`
- `lifecycle_state`: `formalized`
- `active_task`: `none`
- `active_correction_task`: `none`
- `roadmap_objective`: `Deterministic Orchestration`
- `feature_goal`: `Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.`
- `state_gap`: `The project-local configuration flow still needs to be connected to the broader runtime orchestration loop.`
- `planning_hint`: `Connect the validated project-local configuration flow to the broader runtime orchestration loop.`

Requirements:
- Generate exactly one atomic, reviewable next task.
- Choose the smallest meaningful step that advances this feature from the current gap.
- Keep the task within this feature and within a small file footprint.
- Base the task on current repository reality under the listed paths.
- Do not generate a backlog.
- Do not plan work for another feature.
- Do not modify files.

Return exactly one YAML block with this shape and no other text:

planner_output:
  task:
    task_id: F002-T04
    feature_id: 002-configuration-model
    title: string
    objective: string
    first_executable_step: string
    minimum_progress_evidence:
      - string
    trace:
      roadmap_objective: Deterministic Orchestration
      feature_goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
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