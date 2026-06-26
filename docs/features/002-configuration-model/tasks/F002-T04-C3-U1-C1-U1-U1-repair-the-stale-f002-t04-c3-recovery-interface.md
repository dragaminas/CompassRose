# Task F002-T04-C3-U1-C1-U1-U1: Repair the stale F002-T04-C3 recovery interface

## Task ID
`F002-T04-C3-U1-C1-U1-U1`

## Task Lineage

- previous_task_id: `F002-T04-C3-U1-C1-U1`

## Parent Feature
`002-configuration-model`

## Goal
Reissue the F002-T04-C3 doctor recovery interface as a later version of F002-T04-C3-U1-C1-U1 so the task artifact, feature state, and project state converge on one task_interface_gap recovery path from implementation_failed to task_ready, preserve the prior no-diff and missing Implementation Notes evidence, and restore task_ready.

## First Executable Step
grep -n -E 'task_interface_gap|task-interface-gap-F002-T04-C3-stale-preimage-mismatch|state_corruption|F002-T04-C3-U1-C1-U1|F002-T04-C1|review_pending|Implementation Notes|no diff|task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md

## Minimum Progress Evidence
- git diff --name-only -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md lists exactly those three files.
- git diff -- docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md shows the recovery artifact now names task-interface-gap-F002-T04-C3-stale-preimage-mismatch, task_interface_gap, implementation_failed, task_ready, no diff, and Implementation Notes.
- git diff -- docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md shows both state docs agree on the same task-interface-gap-F002-T04-C3-stale-preimage-mismatch recovery path and preserve the prior no-diff / missing Implementation Notes lesson.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The current recovery artifact still reasons from the older F002-T04-C3-U1-C1 preimage while state.md records active_task=F002-T04-C3-U1-C1-U1, so the feature needs a bounded doctor successor for blocker signature task-interface-gap-F002-T04-C3-stale-preimage-mismatch instead of a direct state-correction pass.

## Context
- Feature 002 is blocked by a stale recovery interface, not pure state drift. The diagnosed blocker signature is task-interface-gap-F002-T04-C3-stale-preimage-mismatch, and the task must preserve the earlier no-diff / missing Implementation Notes evidence while converging the task artifact, feature state, and project state on one task_interface_gap path.

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
- `.git/**`

## Constraints
- Run this as doctor recovery with no_review_loop semantics; do not route it through the normal reviewer loop.
- Keep the change documentation-only and bounded to the three allowed paths.
- Preserve the prior no-diff and missing Implementation Notes evidence, the stale preimage mismatch, and the restoration target exactly as lifecycle_state: task_ready, active_task: F002-T04-C3-U1-C1-U1, active_correction_task: none, active_unblock_task: none.
- Do not reclassify the blocker as pure state drift; the diagnosis is a task_interface_gap that needs interface hardening.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The task is issued as a later version of F002-T04-C3-U1-C1-U1 via previous_task_id and preserves the earlier task as historical evidence.
- The recovery artifact explicitly records task-interface-gap-F002-T04-C3-stale-preimage-mismatch, task_interface_gap, implementation_failed, task_ready, no diff, and missing Implementation Notes, with the restoration target anchored on active_task: F002-T04-C3-U1-C1-U1.
- docs/features/002-configuration-model/state.md and docs/compassrose/PROJECT_STATE.md agree on one implementation_failed -> task_ready recovery path and remove stale review_pending or F002-T04-C1 narration.
- Only the three allowed paths change and the quality gates pass in a plain shell.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
git diff --check
grep -q 'task_interface_gap' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'task-interface-gap-F002-T04-C3-stale-preimage-mismatch' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'F002-T04-C3-U1-C1-U1' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'implementation_failed' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'task_ready' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'Implementation Notes' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md && grep -q 'no diff' docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md
for f in docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md; do grep -q 'F002-T04-C3-U1-C1-U1' "$f" && grep -q 'task-interface-gap-F002-T04-C3-stale-preimage-mismatch' "$f" && grep -q 'task_interface_gap' "$f" && grep -q 'implementation_failed' "$f" && grep -q 'task_ready' "$f" && ! grep -q 'review_pending' "$f" && ! grep -q 'F002-T04-C1' "$f"; done
files='docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md docs/features/002-configuration-model/state.md docs/compassrose/PROJECT_STATE.md'; out=$(git diff --name-only -- $files); printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/tasks/F002-T04-C3-U1-C1-U1-harden-the-f002-t04-c3-recovery-interface.md' && printf '%s\n' "$out" | grep -qx 'docs/features/002-configuration-model/state.md' && printf '%s\n' "$out" | grep -qx 'docs/compassrose/PROJECT_STATE.md'
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-blocked-a-direct-correct-state-would-only-patch-the-visible-docs-and-would-not-
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F002-T04-C3-U1-C1-U1; active_correction_task=none; active_unblock_task=none
- evidence: A direct `correct_state` would only patch the visible docs and would not preserve task lineage or repair the stale recovery interface. The blocker is recoverable, and the contract says stale recovery interfaces should be handled by a bounded doctor recovery successor, with `previous_task_id` if it is reissued.
- evidence: - kind: state_corruption
- evidence: - signature: state-corruption-blocked-diagnostic-autocorrection-returned-malformed-or-incomplete-structured-o
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T04-C3-U1-C1-U1`
- active_correction_task: `none`
- active_unblock_task: `none`
