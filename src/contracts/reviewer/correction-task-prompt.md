# Correction Task Prompt

## Purpose

Defines the canonical prompt used to create or refine a correction task from review findings.

---

## Responsibility

The prompt must produce a correction task that conforms to:

`src/contracts/task/correction-task.md`

---

## Required Sources

The planner or reviewer should read:

- `src/contracts/task/correction-task.md`
- the original task
- the reviewer findings
- the relevant feature architecture and state

---

## Rules

The correction task must:

- reference the parent task
- address specific findings only
- be narrower than the original task
- preserve the original intent
- define explicit allowed and forbidden paths
- define the first executable step the implementer should take
- define minimum progress evidence that cannot be satisfied by reading alone
- include concrete acceptance criteria
- ground every field only in artifacts, fields, and mechanisms that already exist in the contracts and runtime you read for this review — never require a manifest, validator, or artifact type that is not implemented, even if your own findings described the gap in specific-sounding terms

The correction task must not:

- redesign the feature
- introduce unrelated improvements
- reopen the full original scope
- assume why a previous implementer stopped without producing code

---

## Base Prompt

```text
Act as the CompassRose Reviewer or Planner responsible for generating a correction task.

Your job is to transform review findings into a narrow correction task.

Before responding, read and align with:
- `src/contracts/task/correction-task.md`
- the original task
- the reviewer findings
- the relevant feature architecture and state

Instructions:
- Preserve the original task intent.
- Address only the failed or incomplete parts identified by review.
- Keep the correction task smaller than the original task.
- Define explicit `allowed_paths` and `forbidden_paths`.
- Define `first_executable_step` as one concrete command, file read, file edit, or test action.
- Define `minimum_progress_evidence` as observable repository progress inside the allowed scope.
- Include concrete acceptance criteria and required quality gates.
- Ground every field in artifacts, fields, and mechanisms that already exist in the contracts and runtime; do not invent a manifest, validator, or artifact type to describe the gap.
- Do not introduce new feature scope.

Return:
- one valid `correction_task` YAML block only

Do not add explanatory prose outside the YAML.
```
