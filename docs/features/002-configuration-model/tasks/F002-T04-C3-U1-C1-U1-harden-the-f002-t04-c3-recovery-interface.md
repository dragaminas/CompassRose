# Task F002-T04-C3-U1-C1-U1: Harden the F002-T04-C3 recovery interface

## Task ID
`F002-T04-C3-U1-C1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Repair the stale recovery interface around `F002-T04-C3` so the current recovery artifact, feature state, and project state all describe one explicit `task_interface_gap` path from `implementation_failed` to `task_ready`, preserve the prior `no diff` plus missing `Implementation Notes` evidence, and surface the stale exact-string preimage mismatch as the diagnostic that justifies the bounded recovery successor.

## First Executable Step
grep -n -E 'task_interface_gap|task-interface-gap-F002-T04-C3-stale-preimage-mismatch|state_corruption|F002-T04-C3-U1-C1-U1|F002-T04-C1|review_pending|Implementation Notes|no diff|task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md

## Minimum Progress Evidence
- `git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` lists exactly those three files.
- `git diff -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md` shows the recovery artifact now names `task-interface-gap-F002-T04-C3-stale-preimage-mismatch`, `task_interface_gap`, `implementation_failed`, `task_ready`, `no diff`, and `Implementation Notes`.
- `git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` shows both state docs agree on the same `task-interface-gap-F002-T04-C3-stale-preimage-mismatch` recovery path and preserve the prior `no diff` / missing `Implementation Notes` lesson.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The current recovery artifact still reasons from the older `F002-T04-C3-U1-C1` preimage while `state.md` records `active_task=F002-T04-C3-U1-C1-U1`, so the feature needs a bounded doctor successor for blocker signature `task-interface-gap-F002-T04-C3-stale-preimage-mismatch` instead of a direct state-correction pass.

## Context
- Feature `002-configuration-model` is blocked by a stale recovery interface, not pure state drift. The diagnosed blocker signature is `task-interface-gap-F002-T04-C3-stale-preimage-mismatch`, and the task must preserve the earlier `no diff` / missing `Implementation Notes` evidence while converging the task artifact, feature state, and project state on one `task_interface_gap` path.
- The latest edit attempt reported `Could not find oldString in the file` followed by `No changes to apply: oldString and newString are identical`, which is evidence that the interface was patching a stale preimage rather than a fresh target.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`

## Constraints
- Update only the current recovery artifact and the two state documents; do not repair this by touching source code, tests, or configuration contracts.
- Preserve `F002-T04-C3` as the recovery anchor and document the restoration target exactly as `lifecycle_state: task_ready`, `active_task: F002-T04-C3-U1-C1-U1`, `active_correction_task: none`, and `active_unblock_task: none`.
- Carry the prior implementation-failure evidence directly in the recovery artifact and aligned state narratives: the earlier `F002-T04-C3` attempt produced no diff and omitted the required `Implementation Notes`.
- Keep the task documentation-only, and make the feature and project narratives consistent with the current `task_interface_gap` recovery situation instead of generic state-corruption wording or contradictory blocked/not-blocked text.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md` is rewritten as a `task_interface_gap` recovery artifact for `F002-T04-C3`, with the observed `quality_failed` state, the explicit restoration target back to `task_ready`, and the prior `no diff` plus missing `Implementation Notes` evidence recorded directly in the task text.
- The recovery artifact updates its first executable step, minimum progress evidence, acceptance criteria, and quality gates so they check for stale recovery markers and require aligned edits in all three allowed files.
- `docs/features/002-configuration-model/state.md` describes one consistent `F002-T04-C3` recovery path, preserves the blocked-from `implementation_failed` evidence and restoration target, and removes stale `F002-T04-C1` or empty-placeholder recovery narration.
- `docs/compassrose/PROJECT_STATE.md` matches the feature-state narrative by describing the same stale recovery-interface problem and recovery target without contradictory blocked/not-blocked wording.
- Only the three allowed documentation files change, and the resulting diff stays narrowly focused on repairing and hardening the stale recovery interface.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
git diff --check
grep -q 'F002-T04-C3' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'task_interface_gap' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'task-interface-gap-F002-T04-C3-stale-preimage-mismatch' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'implementation_failed' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'Implementation Notes' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'no diff' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md
for f in docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md; do grep -q 'F002-T04-C3-U1-C1-U1' "$f" && grep -q 'task-interface-gap-F002-T04-C3-stale-preimage-mismatch' "$f" && grep -q 'task_interface_gap' "$f" && grep -q 'implementation_failed' "$f" && grep -q 'task_ready' "$f" && ! grep -q 'review_pending' "$f" && ! grep -q 'F002-T04-C1' "$f"; done
files='docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md'; out=$(git diff --name-only -- $files); printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md' && printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$out" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
```

## Expected Deliverables
- `documentation`

## Doctor Recovery
- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context
- kind: task_interface_gap
- signature: task-interface-gap-F002-T04-C3-stale-preimage-mismatch
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T04-C3-U1-C1; active_correction_task=none; active_unblock_task=none
- evidence: A bounded doctor recovery successor can safely repair and harden this stale recovery interface without architectural review. It should preserve `F002-T04-C3` as the recovery anchor, restate the prior implementation-failure evidence, and tighten the task text, acceptance checks, and quality gates so the recovery documents converge on one explicit `implementation_failed -> task_ready` path.
- evidence: The latest edit attempt reported `Could not find oldString in the file` and then `No changes to apply: oldString and newString are identical`, which means the interface was operating on a stale preimage rather than a fresh target.
- evidence: The earlier `F002-T04-C3` attempt still produced no diff and omitted the required `Implementation Notes`.

## Restoration Target
- lifecycle_state: task_ready
- active_task: `F002-T04-C3-U1-C1-U1`
- active_correction_task: `none`
- active_unblock_task: `none`
