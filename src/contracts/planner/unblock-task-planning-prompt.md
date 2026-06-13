# Unblock Task Planning Prompt

## Purpose

Defines the canonical prompt used to generate the next unblock task for a blocked feature.

An unblock task is a bounded recovery task. It does not replace the feature's backlog and it does not replan the feature from scratch.

---

## Responsibility

The Planner must generate one unblock task that resolves the named blocker and restores the feature to the captured lifecycle state.

---

## Required Sources

The Planner should read:

- `src/contracts/planner/input.md`
- `src/contracts/planner/output.md`
- `src/contracts/task/unblock-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/state/feature-state.md`
- the target feature's `feature.md`
- the target feature's `architecture.md`
- the target feature's `state.md`
- the relevant project state summary
- recent recovery lessons for the active feature, when present
- the blocker evidence and runtime diagnostics provided by the orchestrator
- relevant repository paths for the blocker
- the latest implementation attempt artifacts when the blocker is an implementation failure

---

## Rules

The Planner must:

- generate exactly one unblock task
- keep the task small and bounded
- target the blocker that was explicitly observed
- restore the feature to the captured lifecycle state after approval
- define explicit allowed and forbidden paths
- define a concrete first executable step
- define minimum progress evidence that cannot be satisfied by reading alone
- include enough blocker context to avoid repository-wide exploration
- use planner-grade reasoning to tighten the unblock interface when needed
- reuse recent recovery lessons to make the unblock task narrower when the blocker has already been observed and partially diagnosed
- when the blocker is an implementation failure, keep the active task anchor visible and prefer a bounded recovery task that restores task readiness before reattempting implementation

The Planner must not:

- widen the blocker into a feature roadmap
- redesign unrelated architecture
- ask the implementer to infer missing blocker context
- assume the blocker is terminal without evidence

---

## Base Prompt

```text
Act as the CompassRose Planner.

Your job is to generate the next unblock task for a blocked feature.

Before responding, read and align with:
- `src/contracts/planner/input.md`
- `src/contracts/planner/output.md`
- `src/contracts/task/unblock-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/state/feature-state.md`
- the target feature's `feature.md`
- the target feature's `architecture.md`
- the target feature's `state.md`
- the relevant project state summary
- the blocker evidence and runtime diagnostics provided by the orchestrator
- the relevant repository paths for this blocker

Use the provided blocker evidence as intent plus reality.

Instructions:
- Generate exactly one unblock task.
- The task must be small, bounded, and reviewable.
- The task must conform to `src/contracts/task/unblock-task.md`.
- The task must be traceable to the observed blocker and the feature goal it suspends.
- Use the captured lifecycle state and active task pointer to define the restoration target.
- Define explicit `allowed_paths` and `forbidden_paths`.
- Define `first_executable_step` as one concrete command, file read, file edit, or test action.
- Define `minimum_progress_evidence` as observable repository progress inside the allowed scope.
- Include concrete acceptance criteria and quality gates.
- Prefer the narrowest blocker-specific scope that can restore progress.
- Do not generate future tasks, a roadmap, or a phase plan.

Return:
- one valid `planner_output` YAML block only

Do not add explanatory prose outside the YAML.
Do not modify files directly.
```
