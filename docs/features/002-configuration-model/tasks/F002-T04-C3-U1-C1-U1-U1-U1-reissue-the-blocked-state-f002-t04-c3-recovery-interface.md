# Task F002-T04-C3-U1-C1-U1-U1-U1: Reissue the blocked-state F002-T04-C3 recovery interface

## Task ID
`F002-T04-C3-U1-C1-U1-U1-U1`

## Task Lineage

- previous_task_id: `F002-T04-C3-U1-C1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Reissue the F002-T04-C3 doctor recovery interface so the task doc and state docs record the current state_corruption blocker, preserve the active anchor F002-T04-C3-U1-C1-U1, and restore the feature to blocked after doctor quality gates pass.

## First Executable Step
Edit docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md to replace the stale task_ready recovery target with the current blocked-state doctor recovery target for state_corruption.

## Minimum Progress Evidence
- git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md lists exactly those three files.
- git diff -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md shows the task doc now records doctor_recovery, no_review_loop, state_corruption, and the blocked restoration target for active_task: F002-T04-C3-U1-C1-U1.
- git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md shows both state docs agree on the same blocked recovery path and preserve active_task: F002-T04-C3-U1-C1-U1.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The current recovery interface still points at the stale task_ready target, while the live feature state is blocked under a recoverable state_corruption diagnostic. The next doctor task must preserve the anchor and re-enter blocked deterministically.

## Context
- Feature 002-configuration-model is recoverably blocked. The current task interface and the state/project narratives need to converge on the blocked-state recovery path for active_task F002-T04-C3-U1-C1-U1 without widening into source or configuration changes.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/**`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/request.md`
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-U1-repair-the-stale-f002-t04-c3-recovery-interface.md`
- `.git/**`

## Constraints
- Keep this bounded to a doctor recovery task with no_review_loop semantics; do not route it through the normal reviewer loop.
- Preserve the recorded active_task anchor F002-T04-C3-U1-C1-U1 and restore the captured lifecycle state blocked after the doctor quality gates pass.
- Do not touch source, tests, or project configuration.
- Do not reclassify this as a pure state correction task; the recovery interface itself is part of the blocker.
- Keep the change narrowly focused on the blocked recovery interface and the state narratives that describe it.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The task is issued as a later version of F002-T04-C3-U1-C1-U1 via previous_task_id and preserves that earlier task as historical evidence.
- The task document explicitly records the state_corruption blocker, the doctor/no_review_loop policy, and the blocked restoration target for active_task F002-T04-C3-U1-C1-U1.
- docs/features/002-configuration-model/state.md and docs/compassrose/PROJECT_STATE.md agree on the same blocked recovery path and preserve the recorded anchor without introducing a conflicting task_ready recovery target.
- Only the three allowed documentation files change, and the re-entry gates pass in a plain shell.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-U1-repair-the-stale-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
git diff --check
changed="$(git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)"; printf '%s\n' "$changed" | grep -qx 'docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md' && printf '%s\n' "$changed" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$changed" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
grep -F 'doctor_recovery' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -F 'no_review_loop' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -F 'state_corruption' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -F 'lifecycle_state: blocked' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -F 'active_task: F002-T04-C3-U1-C1-U1' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md
for f in docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md; do grep -F 'active_task: F002-T04-C3-U1-C1-U1' "$f" && grep -F 'state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr' "$f" && grep -F 'blocked' "$f"; done
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
