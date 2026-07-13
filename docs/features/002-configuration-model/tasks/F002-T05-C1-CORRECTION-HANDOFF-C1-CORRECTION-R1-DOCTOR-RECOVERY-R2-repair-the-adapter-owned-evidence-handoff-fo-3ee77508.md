# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-DOCTOR-RECOVERY-R2: Repair the adapter-owned evidence handoff for the nested preflight task

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-DOCTOR-RECOVERY-R2`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1`

## Parent Feature
`002-configuration-model`

## Goal
Produce a fresh, internally consistent adapter/runtime handoff for the already-satisfied nested preflight behavior, preserving repository state and restoring execution to the recorded active task.

## First Executable Step
From the repository root, run `git diff -- tests/main.test.ts` and do not edit any file.

## Minimum Progress Evidence
- Fresh diff evidence records either an unchanged non-empty diff limited to tests/main.test.ts or an empty diff with the requested behavior already present.
- Fresh output records exit codes and diagnostics for the targeted nested-preflight passing and failing-preflight tests.
- `git diff --check -- tests/main.test.ts` passes.
- quality-gates.json contains six fresh passing records for the exact required commands.
- The normalized handoff uses non-empty canonical `implementation.implementation_notes` consistent with `changed_files` and `git_diff`, using mutually exclusive changed-result or already_complete semantics.
- The adapter/runtime preserves non-empty implementation_context_paths and task, prompt, and runtime-context artifacts, and every recorded context path exists.

## Trace
- Roadmap objective: Complete the configuration model by proving its runtime and doctor handoff is re-entry-ready.
- Feature goal: Connect the documented configuration model to reliable doctor/runtime execution without expanding provider-specific or unrelated orchestration behavior.
- State gap: The nested preflight behavior is already present, but the latest handoff is blocked by missing adapter-owned context paths, incomplete quality-gate records, and contradictory implementation notes.

## Context
- This is an evidence-only recovery. The prior review did not reject the behavior or require a code change; it rejected the handoff contract. The adapter/runtime owns implementation.json, quality-gates.json, implementation_context_paths, and preservation of task, prompt, and runtime-context artifacts. The implementer supplies canonical implementation_notes but cannot fabricate adapter-owned fields.

## Scope
Allowed:
- `tests/main.test.ts (read-only inspection only)`
- `docs/features/002-configuration-model/state.md (read-only reference only)`
- `docs/compassrose/PROJECT_STATE.md (read-only reference only)`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-complete-the-already-satisfied-nested-preflight-evidence-handoff.md (read-only reference only)`
- `src/contracts/task/doctor-recovery-task.md (read-only reference only)`
- `src/contracts/runtime/operation-loop.md (read-only reference only)`
- `runtime-owned temporary handoff artifacts outside the repository root`

Forbidden:
- `Any modification to tests/main.test.ts`
- `Any modification to docs/features/002-configuration-model/state.md`
- `Any modification to docs/compassrose/PROJECT_STATE.md`
- `Any modification to the existing task artifact or any file under docs/features/002-configuration-model/tasks/`
- `Any source, test, contract, configuration, or project-document edits in the repository`
- `Any global external-tool configuration path`
- `Any implementer-written implementation.json, quality-gates.json, implementation_context_paths, or preserved runtime-context artifact`

## Constraints
- Execute as the doctor role with no_review_loop semantics; do not open a normal reviewer loop.
- Treat this as evidence/interface recovery, not feature implementation.
- Preserve the existing tests/main.test.ts state and make no repository edits.
- Use the canonical field implementation.implementation_notes; implementation.notes is invalid and must not be required.
- Use mutually exclusive handoff branches: a non-empty current diff requires changed_files/git_diff to describe it and forbids already_complete; an empty diff requires already_complete, no claimed edits, and cited pre-existing evidence.
- Derive test counts and gate results from fresh structured artifacts, not duplicated or stale prose.
- The adapter/runtime, not the implementer, must create or preserve implementation_context_paths and task, prompt, and runtime-context artifacts; require each recorded path to exist.
- Preserve the supplied blocker signature and recovery lineage.
- After doctor gates pass, restore exactly the fixed restoration target; do not restore quality_failed or select a new normal task.
- Do not broaden into configuration redesign, runtime implementation, test edits, or documentation cleanup.

## Development Policy
- `documentation_first`

## Acceptance Criteria
- The doctor-owned handoff is fresh and adapter/runtime-complete, with non-empty canonical implementation.implementation_notes and existing implementation_context_paths.
- The handoff is internally consistent: changed_files matches git_diff, or an empty diff is justified as already_complete with no claim that edits were made.
- All six exact quality-gate commands have fresh passing records, including git diff --check, the full tests/main.test.ts suite, both targeted nested-preflight tests, npm run typecheck, and npm test.
- The existing tests/main.test.ts correction and nested preflight behavior remain unchanged; no repository file is modified by this recovery.
- The runtime-owned task, prompt, and runtime-context artifacts are preserved and every recorded context path exists.
- The doctor recovery passes its re-entry gates without review, then restores lifecycle_state implementation_running with active_task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1 and both active_correction_task and active_unblock_task set to none.

## Files Likely Affected
- `tests/main.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-complete-the-already-satisfied-nested-preflight-evidence-handoff.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`

## Quality Gates to Run
```bash
git diff --check -- tests/main.test.ts
npx vitest run tests/main.test.ts
npx vitest run tests/main.test.ts -t "nested preflight succeeds"
npx vitest run tests/main.test.ts -t "nested failing preflight"
npm run typecheck
npm test
```

## Expected Deliverables
- `documentation`

## Doctor Recovery

- executor_role: doctor
- review_policy: no_review_loop

## Blocker Context

- kind: unknown
- signature: unknown-quality-failed-feature-002-configuration-model-is-in-quality-failed-and-needs-diagnosis-
- recoverability: agent
- observed_state: lifecycle=quality_failed; active_task=F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1; active_correction_task=none; active_unblock_task=none
- evidence: Feature 002-configuration-model is in quality_failed and needs diagnosis/autocorrection before normal execution can resume.
- evidence: None
- evidence: lifecycle=quality_failed

## Restoration Target

- lifecycle_state: implementation_running
- active_task: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1`
- active_correction_task: `none`
- active_unblock_task: `none`
