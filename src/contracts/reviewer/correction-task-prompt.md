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
- include concrete acceptance criteria

The correction task must not:

- redesign the feature
- introduce unrelated improvements
- reopen the full original scope

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
- Include concrete acceptance criteria and required quality gates.
- Do not introduce new feature scope.

Return:
- one valid `correction_task` YAML block only

Do not add explanatory prose outside the YAML.
```
