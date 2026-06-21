# Task F002-T04-C3-U1-C1: Complete the F002-T04-C3 recovery path refresh

## Task ID
`F002-T04-C3-U1-C1`

## Parent Feature
`002-configuration-model`

## Goal
Repair the stale recovery interface for F002-T04-C3 while preserving the current active task anchor F002-T04-C3-U1-C1-U1, keeping the prior no-diff / missing Implementation Notes evidence visible, and making one explicit implementation_failed -> task_ready path consistent across the task artifact, feature state, and project state.

## First Executable Step
grep -n 'review_pending\|F002-T04-C1\|Implementation Notes\|task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md

## Minimum Progress Evidence
- git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md lists all three targeted docs.
- git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md shows both state docs now describe the same explicit implementation_failed -> task_ready recovery path for F002-T04-C3 and preserve active_task=F002-T04-C3-U1-C1-U1 without stale F002-T04-C1 or review_pending narration.
- git diff -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md shows the task artifact now preserves the prior no-diff and missing Implementation Notes evidence and points at the stale recovery interface around F002-T04-C3.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Keep the configuration-model recovery path canonical so CompassRose can resume the recorded F002-T04-C3 work deterministically.
- State gap: The active docs still mix stale F002-T04 / review_pending / F002-T04-C1 recovery narration with the real quality_failed state for F002-T04-C3-U1-C1-U1. The unblock task must preserve the prior no-diff and missing Implementation Notes evidence and align the task, feature state, and project state docs on one explicit implementation_failed -> task_ready path.

## Context
- Documentation-only unblock task for a task_interface_gap: harden the stale recovery interface around F002-T04-C3 and preserve the captured quality_failed state (active_task=F002-T04-C3-U1-C1-U1, active_correction_task=none, active_unblock_task=none).

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

Forbidden:
- `src/`
- `docs/compassrose/CONFIG.md`
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/features/002-configuration-model/request.md`
- `docs/ROADMAP.md`

## Constraints
- Preserve the blocker evidence: task_interface_gap around F002-T04-C3 with the prior no-diff and missing Implementation Notes failure.
- Keep the current active task anchor visible as F002-T04-C3-U1-C1-U1; do not replace it with a synthetic anchor.
- Do not reframe this as generic state corruption or a fresh state-correction pass.
- Do not touch code, tests, or project configuration.
- Keep the task documentation-only and bounded to the three allowed paths.
- Use only portable shell commands in the quality gates.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The task artifact names the blocker as a task_interface_gap around F002-T04-C3 and preserves the prior no-diff and missing Implementation Notes evidence.
- docs/features/002-configuration-model/state.md and docs/compassrose/PROJECT_STATE.md describe one consistent implementation_failed -> task_ready recovery path for F002-T04-C3 without stale F002-T04-C1 or review_pending narration, and keep active_task=F002-T04-C3-U1-C1-U1 visible.
- The captured quality_failed state stays visible while the recovery path is made explicit and bounded to the approved docs.
- No files outside the three allowed paths are modified.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
git diff --check
changed="$(git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md)"; printf '%s\n' "$changed" | grep -qx 'docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md' && printf '%s\n' "$changed" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$changed" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
grep -q 'F002-T04-C3' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md && grep -q 'Implementation Notes' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md && grep -q 'no diff' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-complete-the-f002-t04-c3-recovery-path-refresh.md
! grep -q 'review_pending' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && ! grep -q 'F002-T04-C1' docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md && grep -q 'implementation_failed' docs/features/002-configuration-model/state.md && grep -q 'implementation_failed' docs/compassrose/PROJECT_STATE.md && grep -q 'task_ready' docs/features/002-configuration-model/state.md && grep -q 'task_ready' docs/compassrose/PROJECT_STATE.md && grep -q 'F002-T04-C3-U1-C1-U1' docs/features/002-configuration-model/state.md && grep -q 'F002-T04-C3-U1-C1-U1' docs/compassrose/PROJECT_STATE.md
```

## Expected Deliverables
- `documentation`

## Blocker Context

- kind: state_corruption
- signature: state-corruption-quality-failed-a-bounded-unblock-task-can-repair-the-stale-recovery-interface-p
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T04-C3-U1-C1-U1; active_correction_task=none; active_unblock_task=none
- evidence: A bounded unblock task can repair the stale recovery interface, preserve the current `F002-T04-C3` anchor, and align the task/state/project narratives. A plain `correct_state` pass would not fix the interface mismatch, and no human architectural decision is required yet.
- evidence: - kind: implementation_failure
- evidence: - signature: implementation-failure-F002-T04-C3
- evidence: - recoverability: agent
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: quality_failed
- active_task: `F002-T04-C3-U1-C1-U1`
- active_correction_task: `none`
- active_unblock_task: `none`
