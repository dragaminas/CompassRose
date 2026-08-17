# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-DOCTOR-RECOVERY-R1: Complete the already-satisfied nested preflight evidence handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-DOCTOR-RECOVERY-R1`

## Task Lineage

- previous_task_id: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1`

## Parent Feature
`002-configuration-model`

## Goal
Run a bounded, evidence-only doctor recovery that validates the existing nested preflight behavior and produces a coherent adapter-owned handoff with canonical implementation.implementation_notes, complete fresh gate records, consistent diff evidence, and preserved context paths without modifying repository files.

## First Executable Step
From the repository root, run `git diff -- tests/main.test.ts` and record whether the diff is non-empty or empty; do not edit any file.

## Minimum Progress Evidence
- Fresh `git diff -- tests/main.test.ts` output establishes exactly one branch: a non-empty diff limited to `tests/main.test.ts`, or an empty diff with the requested behavior already present.
- Fresh output is recorded for both exact nested-preflight targeted tests, including expected exit codes and diagnostics.
- `git diff --check -- tests/main.test.ts` passes.
- `quality-gates.json` contains one fresh passing record for each of the six exact required commands.
- The normalized handoff contains non-empty canonical `implementation.implementation_notes` consistent with `changed_files` and `git_diff`; an empty diff requires a coherent `already_complete` justification with no claim that edits were made.
- `implementation_context_paths` is preserved by the adapter/runtime and every recorded path exists.

## Trace
- Roadmap objective: Advance the repository-local configuration model through deterministic doctor/runtime validation and recovery.
- Feature goal: Connect configuration validation to the doctor/runtime flow and maintain auditable state based on approved behavior.
- State gap: The nested preflight behavior is already present, but the correction handoff is incomplete and contradictory: adapter-owned context paths are absent, three required gate records are missing, and implementation notes do not agree with the normalized already-complete result.

## Context
- The blocker is a recoverable quality-failed handoff/interface problem, not a missing implementation. The existing `tests/main.test.ts` correction and nested preflight behavior must be preserved while fresh evidence and adapter-owned handoff artifacts are regenerated consistently.

## Scope
Allowed:
- `tests/main.test.ts (read-only inspection only; no writes)`
- `Adapter/runtime-owned temporary handoff artifacts outside the repository root: implementation.json, quality-gates.json, implementation_context_paths, and preserved task/prompt/runtime-context artifacts`

Forbidden:
- `Any repository path other than read-only inspection of tests/main.test.ts`
- `Any edit to tests/main.test.ts`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `The active correction-task document`
- `src/contracts/`
- `src/`
- `proto/`
- `All other tests and repository files`

## Constraints
- Execute as `doctor` with `no_review_loop` semantics; do not invoke or create a normal reviewer step.
- Preserve blocker kind `unknown`, the supplied blocker signature, all blocker evidence, and the active correction-task lineage.
- This is an evidence-only recovery. Do not add, remove, or modify repository source, tests, documentation, task files, or state files.
- Use the canonical field `implementation.implementation_notes`; `implementation.notes` is invalid and must not be required.
- The adapter/runtime owns `implementation.json`, `quality-gates.json`, `implementation_context_paths`, and preservation of task, prompt, and runtime-context artifacts. Do not ask the implementer or doctor to fabricate adapter-owned fields or paths.
- Use mutually exclusive handoff branches: a changed implementation requires a non-empty diff limited to `tests/main.test.ts` and must not claim `already_complete`; an already-complete result requires an empty diff, no claimed edits, and fresh cited evidence that the behavior already exists.
- Take gate statuses, command output, and test counts from fresh structured artifacts. Any prose summary must remain consistent with those artifacts and must not repeat stale counts.
- After all doctor quality gates pass, restore the captured lifecycle state and active task anchor exactly; do not rewrite the failed task as accepted implementation.
- Do not route this through `correct_state`; the blocker is a stale/incomplete task interface and evidence handoff, not pure state drift.

## Development Policy
- `test_guided`

## Acceptance Criteria
- Exactly one mutually exclusive handoff branch is recorded: changed implementation with a non-empty diff limited to `tests/main.test.ts`, or `already_complete` with an empty diff and no claimed edits.
- Both nested-preflight targeted commands pass independently, and their fresh outputs include the expected exit codes and diagnostics for enabled and disabled planner-role behavior.
- All six quality-gate commands have separate fresh passing records in `quality-gates.json`, including `git diff --check` and both targeted nested-preflight tests.
- Canonical non-empty `implementation.implementation_notes` states the current `changed_files` and diff status, lists the gate commands or references their fresh structured records, and contains no contradictory test counts or claimed edits.
- `implementation_context_paths` and preserved task, prompt, and runtime-context artifacts are supplied by the adapter/runtime, and every recorded context path exists.
- No repository file changes are made; the existing `tests/main.test.ts` state and nested preflight behavior remain intact.
- The recovery is recorded with executor `doctor` and review policy `no_review_loop`, while the earlier correction task remains historical evidence through `previous_task_id`.
- After doctor gates pass, the runtime restores `quality_failed` with active task `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1`, `active_correction_task: none`, and `active_unblock_task: none`.

## Files Likely Affected
- `tests/main.test.ts`
- `docs/features/002-configuration-model/tasks/F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-complete-the-already-satisfied-nested-preflight-evidence-handoff.md`
- `src/contracts/task/doctor-recovery-task.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`

## Quality Gates to Run
```bash
git diff --check -- tests/main.test.ts
npx vitest run tests/main.test.ts
npx vitest run tests/main.test.ts -t "nested preflight.*enabled"
npx vitest run tests/main.test.ts -t "nested preflight.*disabled"
npm run typecheck
npm test
```

## Expected Deliverables
- `tests`
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

- lifecycle_state: quality_failed
- active_task: `F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1`
- active_correction_task: `none`
- active_unblock_task: `none`
