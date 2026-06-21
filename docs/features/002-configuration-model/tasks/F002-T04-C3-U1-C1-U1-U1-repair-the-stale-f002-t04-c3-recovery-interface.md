# Task F002-T04-C3-U1-C1-U1-U1: Repair the stale F002-T04-C3 recovery interface

## Task ID
`F002-T04-C3-U1-C1-U1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Rewrite the stale recovery interface around `F002-T04-C3` so the active recovery task file, `docs/features/002-configuration-model/state.md`, and `docs/compassrose/PROJECT_STATE.md` all agree on one `task_interface_gap` path from `implementation_failed` back to `task_ready`, while preserving the active `F002-T04-C3-U1-C1-U1` anchor and the prior no-diff / missing `Implementation Notes` lesson.

## First Executable Step
Run `grep -n -E 'F002-T04|review_pending|F002-T04-C1|Implementation Notes|no diff|task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md`.

## Minimum Progress Evidence
- The diff for `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`, `docs/features/002-configuration-model/state.md`, and `docs/compassrose/PROJECT_STATE.md` shows a single `implementation_failed` -> `task_ready` recovery path anchored on `F002-T04-C3` and still records the no-diff / missing `Implementation Notes` lesson.
- `git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` lists exactly those three files and nothing else.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The feature is already in `implementation_failed`, but the recovery bundle around `F002-T04-C3` still carries stale `F002-T04-C1` / `review_pending` / preimage references and must be tightened so the three recovery docs describe one explicit `implementation_failed` -> `task_ready` path for the preserved `F002-T04-C3-U1-C1-U1` anchor.

## Context
- Feature `002-configuration-model` is blocked by a stale recovery interface, not a product defect. The existing feature and project state already capture the intended recovery target, so the unblock task should only harden the interface and keep the `F002-T04-C3-U1-C1-U1` anchor and no-diff / missing `Implementation Notes` lesson intact.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/request.md`
- `docs/compassrose/CONFIG.md`
- `src/**`
- `.git/**`

## Constraints
- Preserve `F002-T04-C3` as the recovery anchor and restore to `task_ready`; do not invent a new active task anchor or rewrite the feature into a new backlog item.
- Carry the prior implementation-failure evidence forward explicitly: the earlier `F002-T04-C3` attempt produced no diff and omitted the required `Implementation Notes`.
- Keep the change documentation-only and limit edits to the three allowed paths.
- Use portable shell commands only in quality gates; do not rely on optional tools.
- Do not change unrelated feature documents or repository policy.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The task file explicitly names `task_interface_gap` with signature `stale-recovery-interface-F002-T04-C3-implementation_failed-to-task_ready`, records the observed state, and preserves the `task_ready` restoration target with `active_task: F002-T04-C3-U1-C1-U1`.
- The task file, `docs/features/002-configuration-model/state.md`, and `docs/compassrose/PROJECT_STATE.md` all describe one consistent `implementation_failed` -> `task_ready` recovery path for `F002-T04-C3` and keep the `F002-T04-C3-U1-C1-U1` anchor intact.
- The task file carries forward the prior no-diff / missing `Implementation Notes` failure evidence and does not reintroduce `review_pending`.
- `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` no longer contain stale `F002-T04-C1` recovery narration or contradictions between current reality and the blocked/blocked-from summary.
- The task remains documentation-only (`development_policy.mode: documentation_first`, `expected_deliverables: documentation`) and only the three allowed paths are changed.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `.git/proto-compassrose/implementation-attempts/F002-T04-C3-U1-C1-U1.json`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`

## Quality Gates to Run
```bash
git diff --check
grep -q 'task_interface_gap' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'F002-T04-C3-U1-C1-U1' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'Implementation Notes' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'no diff' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && ! grep -q 'review_pending' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md
for f in docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md; do grep -q 'F002-T04-C3-U1-C1-U1' "$f" && grep -q 'implementation_failed' "$f" && grep -q 'task_ready' "$f" && ! grep -q 'F002-T04-C1' "$f" && ! grep -q 'review_pending' "$f"; done
files='docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md'; out=$(git diff --name-only -- $files); printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md' && printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$out" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
```

## Expected Deliverables
- `documentation`

## Blocker Context

- kind: state_corruption
- signature: state-corruption-implementation-failed-the-blocker-is-recoverable-but-it-lives-in-the-recovery-i
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=F002-T04-C3-U1-C1-U1; active_correction_task=none; active_unblock_task=none
- evidence: The blocker is recoverable, but it lives in the recovery interface itself rather than in a malformed state record. A bounded unblock task can preserve the `F002-T04-C3` anchor and harden the stale task/state/project narrative; `correct_state` would leave the stale interface in place, and `stop_with_diagnostic` is unnecessary because the recovery target is already explicit.
- evidence: - kind: task_interface_gap
- evidence: - signature: stale-recovery-interface-F002-T04-C3-implementation_failed-to-task_ready
- evidence: - recoverability: agent
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C3-U1-C1-U1`
- active_correction_task: `none`
- active_unblock_task: `none`
