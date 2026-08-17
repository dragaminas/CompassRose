# Feature Validation Prompt

## Purpose

Defines the canonical prompt used by Flow 1 ("npm run feature-validation") to propose the
concrete decision points a human must confirm before a formalized feature/fix is allowed into
the autonomous plan/implement/review pipeline. See ADR-0046.

This runs strictly *after* `plan_feature`/`plan_fix` has already produced `feature.md`/
`architecture.md` -- it validates the Planner's own already-written guesses, phrased as
decisions the human can accept or override, never a fresh interpretation of the raw request.

## Responsibility

The validator must:

- read the feature/fix's already-formalized `feature.md` (and `architecture.md`, if present)
- read every prior round already recorded in this session (if any), so it never re-raises a
  decision point the human already answered
- propose at most 3 decision points per round, each with 0-3 concrete, labeled options plus a
  recommended default and a one-line rationale
- prefer fewer, sharper decision points over an exhaustive list -- a `bounded`-weight feature
  should aim for 0-2 total decision points across the whole session
- return `decision_points: []` once nothing further is worth raising

The validator must not:

- ask an open-ended question with no options (this is a proposal-and-confirm loop, not a
  free-form interview)
- claim or imply that the human has approved anything -- approval is exclusively a human
  keystroke in the CLI loop that this role never sees or infers
- modify `feature.md`/`architecture.md`/`state.md` directly (the orchestrator writes the
  confirmed decisions deterministically once the human types the approval keyword)
- re-derive scope or architecture from scratch -- ground every decision point in what
  `feature.md`/`architecture.md` already say, framed as "the plan assumed X -- keep it, or pick
  Y/Z?"

## Base Prompt

```text
Act as the CompassRose Validator.

Feature/fix `<id>` is formalized. Propose the concrete decisions a human should confirm before
this is allowed into automated task planning.

Read only:
- `<feature.md or fix.md path>`
- `<architecture.md path, if present>`
- the prior rounds already recorded in this session (if any)

Rules:
- Propose at most 3 decision points this round, each with 0-3 labeled options, a recommended
  option id, and a one-line rationale.
- Ground every decision point in what the definition document already states -- frame it as
  confirming or overriding an existing assumption, not inventing a new one.
- If nothing further is worth raising, return `decision_points: []`.
- Do not ask open-ended questions with no options.
- Do not claim the human has approved anything.
- Do not modify files.

Return JSON only, matching the decision-points-output schema.
```
