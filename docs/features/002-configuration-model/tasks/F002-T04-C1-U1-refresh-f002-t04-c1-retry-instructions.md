# Task F002-T04-C1-U1: Refresh F002-T04-C1 retry instructions

## Task ID
`F002-T04-C1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Tighten the active F002-T04-C1 recovery interface so the next implementation attempt has current blocker evidence, exact file targets, and an explicit restoration target of `task_ready` with `active_task: F002-T04-C1`.

## First Executable Step
sed -n '1,220p' docs/features/002-configuration-model/tasks/004.1-repair-feature-state-for-f002-t04.md

## Minimum Progress Evidence
- A diff updates `docs/features/002-configuration-model/tasks/004.1-repair-feature-state-for-f002-t04.md` to replace stale blocked-state repair assumptions with the current `implementation_failed` context, the no-diff `permission_prompt` evidence, and the exact restoration target.
- A diff updates `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` to remove stale claims that `F002-T04-C1` already applied or that `F002-T05` is the active recovery target, while preserving `F002-T04-C1` as the retry anchor.

## Trace
- Roadmap objective: Make the repository-local configuration model a deterministic source of CompassRose runtime policy.
- Feature goal: Connect configuration validation to the doctor/runtime flow and update state based on approved behavior.
- State gap: Feature `002-configuration-model` is stuck in `implementation_failed` because the recovery interface around `F002-T04-C1` is stale after a no-diff prototype attempt and no longer gives the next implementer a clean retry target.

## Context
- `F002-T04-C1` is still the intended recovery anchor, but the last attempt recorded `changed_files: []`, empty `git_diff`, and `permission_prompt` diagnostics in `.git/proto-compassrose/implementation-attempts/F002-T04-C1.json`. The feature and project state documents still carry stale recovery narrative, including unrelated `F002-T05` references and already-applied correction claims, so the unblock work should refresh only the task interface and paired recovery notes needed to retry `F002-T04-C1` deterministically.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `.git/proto-compassrose/implementation-attempts/`

## Constraints
- Keep the unblock work documentation-only; do not change runtime, config-loader, doctor, or contract code.
- Preserve `F002-T04-C1` as the retry anchor; do not reassign the recovery target to `F002-T04` or `F002-T05`.
- Use the recorded no-diff `permission_prompt` attempt as blocker evidence and make the remaining edit target explicit enough to avoid repository-wide exploration.
- Do not change `## Lifecycle State` or operational-status pointers in `docs/features/002-configuration-model/state.md`; only tighten the task and recovery narrative needed to retry `F002-T04-C1`.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The active correction-task document now describes the current blocker as the no-diff `permission_prompt` failure, names the exact repository files still needing edits, and records the restoration target `task_ready` with `active_task: F002-T04-C1`.
- `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` no longer claim `F002-T04-C1` already applied or refer to unrelated `F002-T05` recovery work; they describe the current `implementation_failed` recovery state anchored to `F002-T04-C1`.
- The unblock change stays within the allowed documentation paths and leaves source code, contracts, configuration, and implementation-attempt artifacts unchanged.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/004.1-repair-feature-state-for-f002-t04.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `.git/proto-compassrose/implementation-attempts/F002-T04-C1.json`

## Quality Gates to Run
```bash
git diff --check
grep -E -n "F002-T04-C1|permission_prompt|task_ready" docs/features/002-configuration-model/tasks/004.1-repair-feature-state-for-f002-t04.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md
test -z "$(grep -E -n 'F002-T05|State correction F002-T04-C1 applied' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)"
```

## Expected Deliverables
- `documentation`

## Blocker Context

- kind: implementation_failure
- signature: implementation-failure-implementation-failed-feature-002-configuration-model-is-in-implementatio
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=none; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed; plan a bounded recovery unblock task that restores task readiness for F002-T04-C1.
- evidence: - kind: implementation_failure
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
