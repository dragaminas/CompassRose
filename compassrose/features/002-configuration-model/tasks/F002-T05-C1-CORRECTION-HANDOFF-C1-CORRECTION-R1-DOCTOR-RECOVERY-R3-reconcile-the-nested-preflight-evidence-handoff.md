# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-DOCTOR-RECOVERY-R3: Reconcile the nested-preflight evidence handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-DOCTOR-RECOVERY-R3`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-DOCTOR-RECOVERY-R2`

## Parent Feature
`002-configuration-model`

## Goal
Execute one evidence-only doctor recovery that produces a fresh, internally consistent adapter-owned handoff for the already-present nested preflight behavior and restores the recorded implementation task.

## First Executable Step
From the repository root, run `git diff -- tests/main.test.ts` and do not edit any file.

## Minimum Progress Evidence
- Fresh diff evidence shows either an empty diff with coherent already_complete evidence or a non-empty diff limited to tests/main.test.ts; this recovery must use the empty already_complete branch.
- Fresh output is recorded for both exact nested-preflight targeted tests, including exit codes and diagnostics.
- `git diff --check -- tests/main.test.ts` passes.
- Adapter-owned quality-gates.json contains fresh passing records for all six required commands.
- The normalized handoff contains non-empty `implementation.implementation_notes`, consistent changed_files and git_diff data, existing implementation_context_paths, and mutually exclusive already_complete semantics.

## Trace
- Roadmap objective: Advance the repository-local configuration model by restoring its suspended implementation checkpoint.
- Feature goal: Connect validated project configuration behavior to the doctor/runtime flow without expanding into provider-specific or unrelated orchestration work.
- State gap: The feature is blocked by a failed doctor re-entry handoff; R2 did not satisfy fresh gate, context-preservation, canonical-notes, and consistency requirements, although the nested preflight behavior already exists.

## Context
- This is a bounded evidence-only recovery for the recorded task anchor. The prior handoff incorrectly used implementation.notes, omitted adapter-owned context paths and three required quality gates, and contradicted its empty diff with stale implementation prose. The adapter/runtime owns implementation.json, quality-gates.json, and preservation of task, prompt, and runtime-context artifacts.

## Scope
Allowed:
- `tests/main.test.ts (read-only inspection)`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-complete-the-already-satisfied-nested-preflight-evidence-handoff.md (read-only handoff reference)`
- `src/contracts/task/doctor-recovery-task.md (read-only contract reference)`
- `src/contracts/runtime/operation-loop.md (read-only runtime reference)`
- `docs/features/002-configuration-model/state.md (runtime-owned checkpoint only)`
- `docs/compassrose/PROJECT_STATE.md (runtime-owned checkpoint only)`
- `adapter/runtime-owned temporary handoff artifacts outside the repository, emitted by the adapter/runtime`

Forbidden:
- `Any repository implementation or test edits`
- `Any write to tests/main.test.ts`
- `All tests other than read-only inspection of tests/main.test.ts`
- `Manual writes to implementation.json, quality-gates.json, task, prompt, or runtime-context artifacts`
- `Manual edits to feature or project state outside deterministic runtime persistence`
- `Global external-tool configuration and user settings`
- `Unrelated feature, source, contract, or architecture files`

## Constraints
- Execute as doctor with no_review_loop semantics; do not invoke a reviewer.
- Preserve the observed blocker kind unknown and exact blocker signature; do not rewrite recovery history.
- Restore exactly lifecycle_state implementation_running with active_task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1, active_correction_task none, and active_unblock_task none.
- Use canonical `implementation.implementation_notes`; never require or validate `implementation.notes`.
- The current handoff must use already_complete: empty diff, no claimed edits, and cited pre-existing evidence. A changed implementation branch must remain mutually exclusive and may only claim a non-empty diff.
- Treat implementation_context_paths and preservation of adapter-owned artifacts as runtime invariants; the doctor must not fabricate those fields.
- Take test counts and gate results from fresh structured artifacts, not duplicated prose.
- Keep tests/main.test.ts read-only and preserve the existing nested preflight behavior.
- Keep temporary handoff artifacts outside repository scope and do not broaden this into feature implementation or architecture redesign.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The doctor recovery preserves the exact blocker signature, links to recovery R2 through previous_task_id, and emits no normal review step.
- The adapter/runtime handoff records a non-empty canonical implementation.implementation_notes value stating that the current changed_files and git_diff are empty and the behavior is already_complete; it does not claim edits or rely on implementation.notes.
- implementation_context_paths is non-empty, every recorded path exists, and task, prompt, and runtime-context artifacts are preserved by the adapter/runtime rather than fabricated by the implementer.
- All six quality-gate commands have separate fresh passing records with actual output, exit status, and test counts; no stale or contradictory counts are accepted.
- Both targeted nested-preflight tests and the full tests/main.test.ts suite pass, while tests/main.test.ts remains unchanged.
- The runtime records the recovery attempt, clears active_unblock_task after passing re-entry gates, and restores the fixed implementation_running target with the original active task pointer.
- No repository implementation, test, unrelated documentation, or manual state changes are made by the doctor.

## Files Likely Affected
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-complete-the-already-satisfied-nested-preflight-evidence-handoff.md`
- `tests/main.test.ts`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
git diff --check -- tests/main.test.ts
npx vitest run tests/main.test.ts
npx vitest run tests/main.test.ts -t "nested preflight"
npx vitest run tests/main.test.ts -t "nested failing-preflight"
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
- signature: state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr
- recoverability: agent
- observed_state: lifecycle=blocked; active_task=F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is blocked and needs diagnosis/autocorrection to choose bounded recovery or an explicit stop.
- evidence: - kind: unknown
- evidence: - signature: unknown-unblock-pending-doctor-recovery-f002-t05-c1-correction-handoff-c1-correction-r1-doctor-r
- evidence: - recoverability: agent
- evidence: lifecycle=blocked

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1`
- active_correction_task: `none`
- active_unblock_task: `none`
