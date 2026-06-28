# Task F002-T04-C3-U1-C1-U1-C710: Repair feature state for F002-T04-C3-U1-C1-U1

## Task ID
`F002-T04-C3-U1-C1-U1-C710`

## Parent Feature
`002-configuration-model`

## Goal
Canonicalize docs/features/002-configuration-model/state.md so deterministic selection can continue with `F002-T04-C3-U1-C1-U1`.

## First Executable Step
Apply the canonical repair directly to `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md`, preserving `F002-T04-C3-U1-C1-U1`.

## Minimum Progress Evidence
- `docs/features/002-configuration-model/state.md` contains a single canonical `Operational Status` block that matches `blocked`.
- `docs/compassrose/PROJECT_STATE.md` still points at feature `002-configuration-model` and the repaired active task `F002-T04-C3-U1-C1-U1`.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Keep feature state canonical so the runtime selector can continue deterministically.
- State gap: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.

## Context
- Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.

## Scope
Allowed:
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/`
- `tests/`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/compassrose/CONFIG.md`

## Constraints
- Preserve the active task pointer for the repaired feature.
- Do not change implementation code or unrelated feature docs.
- Apply the repair directly through the runtime state-correction path instead of delegating it to the implementer.
- Keep the correction narrowly focused on canonicalizing state.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- `docs/features/002-configuration-model/state.md` has a single canonical `Operational Status` block.
- `active_task` remains `F002-T04-C3-U1-C1-U1` and `active_correction_task` is `none`.
- The feature returns to `blocked` with the repaired state preserved.
- The runtime can continue selecting the active task after the correction is approved.

## Files Likely Affected
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/state/feature-state.md`

## Quality Gates to Run
```bash
git diff --check
```

## Expected Deliverables
- `documentation`

## State Target

- feature_state_path: `docs/features/002-configuration-model/state.md`
- project_state_path: `docs/compassrose/PROJECT_STATE.md`
- contract_reference: `src/contracts/state/feature-state.md`
- detected_issue: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- restored_lifecycle_state: blocked
- restored_active_task: `F002-T04-C3-U1-C1-U1`
- restored_active_correction_task: `none`
