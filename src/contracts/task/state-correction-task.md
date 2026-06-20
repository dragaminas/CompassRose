# State Correction Task Contract

## Purpose

Defines a correction task generated when repository state is malformed but recoverable.

A state correction task repairs feature or project state so deterministic orchestration can resume.

This shape is distinct from `src/contracts/task/correction-task.md` because it targets state documents, not review findings.

It is also a specialized form of `src/contracts/task/unblock-task.md` because its purpose is to remove a blocker that exists only in repository state.

---

## Responsibility

A state correction task restores canonical state without widening scope.

It preserves the feature's active task pointer and only repairs the state needed for deterministic selection.
It does not rewrite a stale recovery interface; if the interface itself is broken, that is an unblock task.

---

## Required Shape

```yaml
state_correction_task:
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

  state_target:
    feature_state_path: string
    project_state_path: string | null
    contract_reference: string
    detected_issue: string
    restored_lifecycle_state: string
    restored_active_task: string
    restored_active_correction_task: string

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
    mode: documentation_first

  quality_gates:
    before_review:
      - string

  acceptance_criteria:
    - string

  expected_deliverables:
    - documentation
```

---

## Rules

A state correction task must:

- Reference the malformed state it is repairing.
- Restore the documented lifecycle state and operational status instead of inventing a new one.
- Preserve the current active task pointer when the active task is still the intended work target.
- If the feature state lost `active_task`, derive the intended repair anchor from project-state hints or another documented repository source before generating the task, but still restore a canonical active task pointer.
- If the recovery interface itself is stale or contradictory, generate an unblock task with `blocker.kind: task_interface_gap` instead of a state correction task.
- Never invent a synthetic active task identifier when the active task anchor is already known; copy the anchor verbatim from the observed state or the documented recovery target.
- When the previous attempt produced no diff or omitted required `Implementation Notes`, include that evidence in `detected_issue` so the next implementer does not need to infer the failure mode.
- Stay within state-document scope.
- Include a concrete `first_executable_step`.
- Include `minimum_progress_evidence` that cannot be satisfied by reading alone.
- Keep `quality_gates.before_review` runnable in a plain shell on the target runtime.
- Prefer portable commands that are expected to exist in the runtime environment.
- For documentation-only state correction, default to portable documentation-safe gates such as `git diff --check`.
- Add repo-specific smoke, typecheck, or test commands only when the task context or repository configuration explicitly guarantees they are available and relevant.
- Do not require optional tools unless the state-correction context explicitly states they are available.

A state correction task must not:

- Replan the feature.
- Reopen the whole feature backlog.
- Modify code unless the state contract explicitly requires it.
- Change unrelated feature documents.
- Assume why the malformed state appeared without evidence.

---

## Lifecycle

```text
Malformed State
    ↓
State Correction Task
    ↓
Implementation
    ↓
Review
    ↓
Restored Feature State
```
