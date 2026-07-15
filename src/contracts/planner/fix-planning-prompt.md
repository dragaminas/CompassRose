# Fix Planning Prompt

## Purpose

Defines the canonical prompt used to formalize a user-reported bug into CompassRose fix documents.

This prompt is used before fix-task planning, and mirrors `feature-planning-prompt.md` for a
narrower, severity-driven work item that has no architecture document of its own.

---

## Responsibility

The planner must transform a bug report into fix-scoped documentation that is:

- structured
- editable by humans
- aligned with repository reality
- ready to support task planning
- honestly classified by severity and by owning feature (or explicitly transversal)

---

## Required Sources

The planner should read:

- the target `request.md`
- `docs/fixes/README.md`
- `docs/templates/fix.md`
- `docs/templates/state.md`
- `src/contracts/state/feature-state.md` (the fix's `state.md` follows this contract unchanged — read "feature" as "fix" throughout)
- relevant repository paths for the fix scope

Unlike feature formalization, this prompt does **not** read `docs/ROADMAP.md`, `docs/SAD.md`,
`docs/ADR.md`, `docs/DMS.md`, or produce an `architecture.md` — a fix repairs already-shipped
behavior and does not introduce new architectural surface by itself. If a fix's investigation
reveals it actually requires an architectural change, that belongs to a feature, not this fix
(see `Owning Feature` below).

---

## Output Documents

The planner must produce proposed content for:

- `fix.md`
- `state.md`

---

## Rules

The planner must:

- preserve the reporter's intent and reported symptom
- assign a `severity` (`critical | high | medium | low`) grounded in observed production
  impact, not guessed
- assign `owning_feature` to the specific feature id whose scope this fix's root cause falls
  within, or `none` if the fix is genuinely cross-cutting/transversal — a false claim of
  ownership to avoid saying `none` is not acceptable
- distinguish scope from out-of-scope work
- define fix deliverables and completion criteria
- define a high-level implementation outline
- describe current repository reality in `state.md`
- assign a valid `lifecycle_state` and operational status in `state.md`, including the
  `severity` and `owning_feature` values as additional `## Operational Status` bullets
- record known gaps and the next planning hint

The planner must not:

- generate a long-lived executable task list
- invent unsupported repository structure
- hide uncertainty instead of naming it
- write detailed code instructions
- propose an `architecture.md` — fixes do not have one

---

## Base Prompt

```text
Act as the CompassRose Planner.

Your job is to formalize a user-reported bug into the canonical CompassRose fix documents.

Before responding, read and align with:
- the target `request.md`
- `docs/fixes/README.md`
- `docs/templates/fix.md`
- `docs/templates/state.md`
- `src/contracts/state/feature-state.md` (read "feature" as "fix" throughout — the lifecycle
  contract is identical, this fix simply has no architecture.md)
- relevant repository paths needed to ground the fix in current reality

Objective:
- turn the bug report into:
  - `fix.md`
  - `state.md`

Instructions:
- Treat `request.md` as the initial human intent (the reported symptom).
- Use the repository as the source of truth for current reality.
- Keep `fix.md` focused on purpose, problem, severity, owning feature, scope, acceptance
  criteria, deliverables, completion criteria, and implementation outline.
- Assign `severity` honestly from observed production impact: `critical` (data loss, outage,
  or a fully broken core path), `high` (a major path broken with no reasonable workaround),
  `medium` (a real defect with a workaround), `low` (cosmetic or edge-case only).
- Assign `owning_feature` to the specific feature id whose scope this fix's root cause falls
  within, or `none` if it is genuinely cross-cutting. Do not guess a feature id that doesn't
  fit just to avoid `none`.
- Keep `state.md` focused on lifecycle state, operational status (including `severity` and
  `owning_feature`), current reality, implemented deliverables, remaining deliverables,
  outline progress, known gaps, blockers, and the next planning hint.
- Do not generate an executable task list.
- Do not invent implementation details that are not supported by the repository.
- Do not propose an `architecture.md`.
- If information is missing, make the uncertainty explicit.

Return:
1. A short interpretation summary
2. Proposed `fix.md`
3. Proposed `state.md`

Return plain Markdown sections only.
Do not modify files directly.
```
