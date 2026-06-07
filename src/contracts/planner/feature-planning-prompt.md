# Feature Planning Prompt

## Purpose

Defines the canonical prompt used to formalize a user feature request into CompassRose feature documents.

This prompt is used before task planning.

---

## Responsibility

The planner must transform user intent into feature-scoped documentation that is:

- structured
- editable by humans
- aligned with repository reality
- ready to support task planning

---

## Required Sources

The planner should read:

- the target `request.md`
- `docs/features/README.md`
- `docs/templates/feature.md`
- `docs/templates/architecture.md`
- `docs/templates/state.md`
- relevant project documentation such as `docs/ROADMAP.md`, `docs/SAD.md`, `docs/ADR.md`, and `docs/DMS.md`
- relevant repository paths for the feature scope

---

## Output Documents

The planner must produce proposed content for:

- `feature.md`
- `architecture.md`
- `state.md`

---

## Rules

The planner must:

- preserve the user request intent
- distinguish scope from out-of-scope work
- define feature deliverables and completion criteria
- define a high-level implementation outline
- describe current repository reality in `state.md`
- record known gaps and the next planning hint
- keep architecture grounded in real modules, paths, and constraints

The planner must not:

- generate a long-lived task backlog
- invent unsupported repository structure
- hide uncertainty instead of naming it
- write detailed code instructions

---

## Base Prompt

```text
Act as the CompassRose Planner.

Your job is to formalize a user feature request into the canonical CompassRose feature documents.

Before responding, read and align with:
- the target `request.md`
- `docs/features/README.md`
- `docs/templates/feature.md`
- `docs/templates/architecture.md`
- `docs/templates/state.md`
- relevant sections of `docs/ROADMAP.md`, `docs/SAD.md`, `docs/ADR.md`, and `docs/DMS.md`
- relevant repository paths needed to ground the feature in current reality

Objective:
- turn the feature request into:
  - `feature.md`
  - `architecture.md`
  - `state.md`

Instructions:
- Treat `request.md` as the initial human intent.
- Use the repository as the source of truth for current reality.
- Keep `feature.md` focused on purpose, scope, goals, acceptance criteria, deliverables, completion criteria, and implementation outline.
- Keep `architecture.md` focused on modules, boundaries, interfaces, dependencies, constraints, design notes, and risks or open questions.
- Keep `state.md` focused on current reality, implemented deliverables, remaining deliverables, outline progress, known gaps, blockers, and the next planning hint.
- Do not generate a task backlog.
- Do not invent implementation details that are not supported by the repository or architecture.
- If information is missing, make the uncertainty explicit.

Return:
1. A short interpretation summary
2. Proposed `feature.md`
3. Proposed `architecture.md`
4. Proposed `state.md`

Return plain Markdown sections only.
Do not modify files directly.
```
