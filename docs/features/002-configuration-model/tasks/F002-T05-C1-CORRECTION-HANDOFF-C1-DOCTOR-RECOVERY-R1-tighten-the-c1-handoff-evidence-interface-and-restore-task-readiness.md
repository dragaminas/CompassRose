# Task F002-T05-C1-CORRECTION-HANDOFF-C1-DOCTOR-RECOVERY-R1: Tighten the C1 handoff evidence interface and restore task readiness

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-C1`

## Parent Feature
`002-configuration-model`

## Goal
Update the active C1 task document with canonical handoff requirements and exact retry scope so the existing nested preflight correction can be retried with reviewable evidence, then let the runtime restore task_ready.

## First Executable Step
Edit docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-complete-evidence-handoff-for-the-passing-nested-preflight-fixture-correction.md to require non-empty implementation.notes, recorded implementation_context_paths, and preservation of the existing tests/main.test.ts correction diff.

## Minimum Progress Evidence
- git diff shows a bounded change in the active C1 task document.
- The task document names implementation.notes as the canonical non-empty handoff field and rejects implementation_notes as an undocumented alias.
- The task document requires implementation_context_paths for preserved task, prompt, and runtime-context artifacts and states that raw_output is not a substitute.
- The task document scopes implementation edits to tests/main.test.ts, identifies src/cli/main.ts as read-only reference material, and instructs retries to preserve and verify the current correction diff.

## Trace
- Roadmap objective: Deliver a repository-local configuration model whose doctor and runtime flow can validate policy and resume deterministic execution.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The active C1 implementation attempt is implementation_failed because it captured no git diff and used implementation_notes without canonical implementation.notes or implementation_context_paths; the recorded task anchor must be restored to task_ready.

## Context
- The C1 fixture correction is reported as behaviorally satisfactory. The failed attempt captured no diff and only an implementation_notes alias; the recovery lesson also requires canonical implementation.notes and adapter-owned implementation_context_paths. This recovery tightens the active task interface without changing source behavior or fabricating adapter artifacts.

## Scope
Allowed:
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-complete-evidence-handoff-for-the-passing-nested-preflight-fixture-correction.md`

Forbidden:
- `tests/main.test.ts (read-only; preserve and verify the existing correction diff)`
- `src/cli/main.ts (read-only reference material)`
- `.git/proto-compassrose/implementation-attempts/F002-T05-C1-CORRECTION-HANDOFF-C1.json (adapter-owned evidence; do not fabricate or rewrite it)`
- `docs/features/002-configuration-model/state.md (runtime-owned restoration)`
- `docs/compassrose/PROJECT_STATE.md (runtime-owned restoration)`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `all other repository paths`

## Constraints
- Execute as the doctor role with no_review_loop semantics.
- Keep this recovery limited to the active C1 task interface and re-entry evidence; do not perform feature work or source refactoring.
- Use implementation.notes as the exact canonical non-empty handoff field; implementation_notes is not an accepted undocumented alias.
- Require implementation_context_paths pointing to preserved task, prompt, and runtime-context artifacts; the adapter, not the doctor, owns capture of those artifacts.
- Treat raw_output as supporting evidence only, never as a substitute for implementation.notes or implementation_context_paths.
- Preserve and verify the existing tests/main.test.ts correction diff; do not recreate or broaden it.
- Do not modify src/cli/main.ts, state files, project state, contracts, or the implementation-attempt artifact.
- Do not assert context_overflow or another unsupported diagnostic without explicit provider, timeout, or limit evidence.
- After the re-entry gates pass, restore exactly the captured task_ready lifecycle and active task anchor.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The active C1 task document explicitly requires non-empty implementation.notes and rejects implementation_notes as an undocumented alias.
- The active C1 task document explicitly requires implementation_context_paths for preserved task, prompt, and runtime-context artifacts and states that raw_output is insufficient.
- The active C1 task document has tests/main.test.ts as its sole editable implementation path, keeps src/cli/main.ts read-only, and removes unrelated likely-affected scope.
- The task document tells a retry with an existing correction diff to preserve and verify that diff rather than recreate it; no source behavior, test file, state file, project state, contract, or attempt artifact is changed by this recovery.
- The targeted regression test, typecheck, and full test suite pass after the interface repair.
- The runtime can restore lifecycle_state task_ready with active_task F002-T05-C1-CORRECTION-HANDOFF-C1, active_correction_task none, and active_unblock_task none after the doctor gates pass.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-complete-evidence-handoff-for-the-passing-nested-preflight-fixture-correction.md`
- `tests/main.test.ts`
- `src/cli/main.ts`
- `.git/proto-compassrose/implementation-attempts/F002-T05-C1-CORRECTION-HANDOFF-C1.json`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check -- docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-complete-evidence-handoff-for-the-passing-nested-preflight-fixture-correction.md
git grep -n -F -e "implementation.notes" -e "implementation_context_paths" -- docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-complete-evidence-handoff-for-the-passing-nested-preflight-fixture-correction.md
npx vitest run tests/main.test.ts
npm run typecheck
npm test
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: state_corruption
- signature: state-corruption-implementation-failed-feature-002-configuration-model-is-in-implementation-fail
- recoverability: agent
- observed_state: lifecycle=implementation_failed; active_task=F002-T05-C1-CORRECTION-HANDOFF-C1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in implementation_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: - kind: implementation_failure
- evidence: - signature: implementation-failure-F002-T05-C1-CORRECTION-HANDOFF-C1
- evidence: - recoverability: agent
- evidence: lifecycle=implementation_failed

## Restoration Target

- lifecycle_state: task_ready
- active_task: `F002-T05-C1-CORRECTION-HANDOFF-C1`
- active_correction_task: `none`
- active_unblock_task: `none`
