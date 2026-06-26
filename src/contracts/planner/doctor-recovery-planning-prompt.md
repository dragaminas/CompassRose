# Doctor Recovery Planning Prompt

## Purpose

Defines the canonical prompt used to generate the next doctor recovery task for a blocked, failed, or stale-recovery feature.

The output is still exactly one bounded task, but that task is executed by the `doctor` role and does not enter the normal review loop.

---

## Responsibility

The Planner must generate one doctor recovery task that removes the observed blocker and restores the feature to the captured lifecycle state.

---

## Required Sources

The Planner should read:

- `src/contracts/planner/input.md`
- `src/contracts/planner/output.md`
- `src/contracts/task/doctor-recovery-task.md`
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

- generate exactly one doctor recovery task
- keep the task small and bounded
- target the blocker that was explicitly observed
- preserve blocker lineage and restoration-target evidence
- restore the feature to the captured lifecycle state after doctor quality gates pass
- define explicit allowed and forbidden paths
- define a concrete first executable step
- define minimum progress evidence that cannot be satisfied by reading alone
- include enough blocker context to avoid repository-wide exploration
- make it explicit that the task is executed by the `doctor` role with `no_review_loop`
- allow documentation, state, source, and tests only when they are truly required by the recovery
- use `test_guided` whenever the recovery changes code or tests
- if this recovery task is a later version of a previous task, set `previous_task_id` to the earlier task and preserve the earlier task as history; otherwise set it to `null`
- route pure state/documentation drift through `correct_state` instead of a doctor recovery task

The Planner must not:

- widen the blocker into a feature roadmap
- redesign unrelated architecture
- ask the doctor role to infer missing blocker context
- assume the blocker is terminal without evidence

---

## Base Prompt

```text
Act as the CompassRose Planner.

Your job is to generate the next doctor recovery task for a blocked or failed feature.

Before responding, read and align with:
- `src/contracts/planner/input.md`
- `src/contracts/planner/output.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/task/state-correction-task.md`
- `src/contracts/state/feature-state.md`
- the target feature's `feature.md`
- the target feature's `architecture.md`
- the target feature's `state.md`
- the relevant project state summary
- the blocker evidence and runtime diagnostics provided by the orchestrator
- the relevant repository paths for this blocker

Instructions:
- Generate exactly one doctor recovery task.
- The task must be small, bounded, and recovery-specific.
- The task must conform to `src/contracts/task/doctor-recovery-task.md`.
- Preserve the blocker signature and restoration target explicitly.
- State that the executor is `doctor` and that recovery re-enters the loop without a reviewer step.
- Define explicit `allowed_paths` and `forbidden_paths`.
- Define `first_executable_step` as one concrete command, file read, file edit, or test action.
- Define `minimum_progress_evidence` as observable repository progress inside the allowed scope.
- Include concrete acceptance criteria and re-entry quality gates.
- Prefer the narrowest blocker-specific scope that can restore progress.
- Do not generate future tasks, a roadmap, or a phase plan.

Return:
- one valid `planner_output` YAML block only

Do not add explanatory prose outside the YAML.
Do not modify files directly.
```
