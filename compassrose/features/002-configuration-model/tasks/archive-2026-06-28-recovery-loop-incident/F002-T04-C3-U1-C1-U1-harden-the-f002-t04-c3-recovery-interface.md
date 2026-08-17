# Task F002-T04-C3-U1-C1-U1: Harden the F002-T04-C3 recovery interface

## Task ID
`F002-T04-C3-U1-C1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Reissue the `F002-T04-C3` doctor recovery interface so the current recovery artifact, feature state, and project state record the blocked `state_corruption` condition, preserve the active anchor `F002-T04-C3-U1-C1-U1`, and keep the feature restored to `blocked` after the doctor quality gates pass.

## First Executable Step
grep -n -E 'state_corruption|state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr|F002-T04-C3-U1-C1-U1|blocked|active_task|active_correction_task|active_unblock_task' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md

## Minimum Progress Evidence
- `git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` lists exactly those three files.
- `git diff -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md` shows the recovery artifact now names `doctor_recovery`, `no_review_loop`, `state_corruption`, `blocked`, and the blocked restoration target for `active_task: F002-T04-C3-U1-C1-U1`.
- `git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md` shows both state docs agree on the same blocked recovery path and preserve `active_task: F002-T04-C3-U1-C1-U1`.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The feature is currently blocked by `state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr`, and the recovery interface must keep the active task anchor while converging the feature and project state on one explicit blocked recovery path.

## Context
- Feature `002-configuration-model` is blocked by a recoverable `state_corruption` diagnostic, not by a task-interface gap. The task must preserve the recorded blocker evidence and keep the state narratives aligned on `blocked` with `active_task=F002-T04-C3-U1-C1-U1`.
- The current recovery path should remain bounded to the recorded blocker and the re-entry point; do not widen into source, config, or unrelated backlog work.

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
- Run this as doctor recovery with no_review_loop semantics; do not route it through the normal reviewer loop.
- Keep the change documentation-only and bounded to the three allowed paths.
- Preserve the blocker evidence and restoration target exactly as `lifecycle_state: blocked`, `active_task: F002-T04-C3-U1-C1-U1`, `active_correction_task: none`, `active_unblock_task: none`.
- Do not reclassify the blocker as a task-interface gap; the current blocker is `state_corruption`.
- Keep the recovery interface narrowly focused on the blocked recovery path and the state narratives that describe it.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The task is recorded as a doctor recovery artifact with `doctor_recovery`, `no_review_loop`, and `state_corruption`.
- The recovery artifact explicitly records the blocked restoration target for `active_task: F002-T04-C3-U1-C1-U1`.
- `docs/features/002-configuration-model/state.md` and `docs/compassrose/PROJECT_STATE.md` agree on the same blocked recovery path and preserve the recorded anchor without introducing a conflicting `task_ready` target.
- Only the three allowed documentation files change, and the re-entry gates pass in a plain shell.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
git diff --check
grep -q 'doctor_recovery' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'no_review_loop' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'state_corruption' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'blocked' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'active_task: F002-T04-C3-U1-C1-U1' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md
for f in docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md; do grep -q 'F002-T04-C3-U1-C1-U1' "$f" && grep -q 'state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr' "$f" && grep -q 'blocked' "$f" && grep -q 'active_unblock_task: none' "$f" && grep -q 'active_correction_task: none' "$f"; done
files='docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md'; out=$(git diff --name-only -- $files); printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md' && printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$out" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
```

## Expected Deliverables
- `documentation`

## Doctor Recovery
- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context
- kind: state_corruption
- signature: state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F002-T04-C3-U1-C1-U1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target
- lifecycle_state: blocked
- active_task: `F002-T04-C3-U1-C1-U1`
- active_correction_task: `none`
- active_unblock_task: `none`
