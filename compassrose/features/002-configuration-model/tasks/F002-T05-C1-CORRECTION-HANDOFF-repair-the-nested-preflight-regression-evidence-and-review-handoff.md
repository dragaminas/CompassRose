# Task F002-T05-C1-CORRECTION-HANDOFF: Repair the nested preflight regression evidence and review handoff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF`

## Parent Task
`F002-T05-C1`

## Parent Feature
`002-configuration-model`

## Goal
Preserve the existing repository-root implementation, make the nested failing-preflight regression test reliably exercise a real runtime-precondition failure, and regenerate complete implementation and quality-gate evidence.

## First Executable Step
Run the targeted tests in tests/main.test.ts and make only the smallest test-fixture adjustment needed for the role-disabled nested case to produce the expected failure; do not change src/cli/main.ts.

## Minimum Progress Evidence
- The targeted main tests pass for both nested success and nested runtime-precondition failure cases, including expected exit codes and diagnostics.
- A non-empty implementation artifact contains implementation.notes; if no source change is needed, it explicitly records already_complete evidence and the current commit.
- Fresh quality-gate output records npm run typecheck and npm test results accurately, without claiming approval while npm test is nonzero.

## Review Findings
- The nested failing-preflight regression currently returns 0 instead of 1.
- The implementation artifact has no stored output and no implementation.notes.
- The live diff handoff is empty and lacks an explicit already-complete diagnostic.
- The supplied and fresh npm test gates fail and must be reconciled before review.

## Scope
Allowed:
- `tests/main.test.ts`

Forbidden:
- `src/cli/main.ts`
- `docs/`
- `src/contracts/`
- `src/doctor/`
- `src/config/`
- `src/git/`
- `proto/`
- `docs/compassrose/PROJECT_STATE.md`

## Constraints
- Preserve the existing repository-root lookup and main(['doctor']) behavior.
- Do not change configuration schema, runtime validation, or diagnostic semantics.
- Keep all repository edits limited to the nested regression-test fixture.
- Do not edit project state or runtime bookkeeping files.
- If failures remain outside this correction scope, report them as blockers rather than expanding scope.

## Acceptance Criteria
- The existing src/cli/main.ts repository-root resolution remains intact.
- The nested passing and failing preflight tests both pass with the expected output and exit codes.
- Implementation notes and explicit handoff diagnostics are present; an already-complete implementation is documented when no source diff is produced.
- Quality-gate results are freshly captured and accurately reported.

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts
npm run typecheck
npm test
```

## Implementation Notes

R4 revalidated the existing bounded recovery diff in `tests/main.test.ts`. Both nested cases create a real `src/deeply/nested` directory and assert that the fixture exists before invoking `main([])`; the fixture still writes only the repository-root `docs/compassrose/CONFIG.md`, so there is no competing nested configuration. The role-disabled nested case continues to assert exit code `1` and the unchanged `roles.planner.enabled` and `runtime preflight` diagnostics. `src/cli/main.ts` was not changed, preserving its existing repository-root lookup, validation, and diagnostic behavior.

The prior recovery's missing implementation output, missing `implementation.notes`, and missing context artifacts remain preserved as execution defects from the blocker evidence; this handoff records non-empty recovery notes and fresh command evidence instead of silently treating the earlier handoff as complete. The restoration target remains `task_ready` with active task `F002-T05-C1-CORRECTION-HANDOFF`, no active correction task, and no active unblock task. State restoration bookkeeping remains untouched as required; the successful doctor gate evidence is available for the runtime handoff. No commit was created.

## Quality Gate Results

- Baseline first step before edits: `npx vitest run tests/main.test.ts` — exit `0`, 7/7 tests passed; the nested passing case returned `0`, and the nested role-disabled case returned `1` with the expected preflight assertions.
- Existing test-guided fixture evidence: the nested-directory invariant first failed in both nested cases, then passed after the fixture created the directory; the targeted nested run passed 2/2.
- `npx vitest run tests/main.test.ts` — exit `0`, 7/7 passed in the mandated R4 baseline; the nested passing case returned `0`, and the nested role-disabled case returned `1` with the expected diagnostics.
- `npm run typecheck` — exit `0`.
- First R4 `npm test` attempt — exit `1`, with 58 passed, 1 failed, and 1 skipped across 12 test files. The failure was `tests/protoBlockerFlows.test.ts` in the `unblock-doc-code-mismatch` scenario, outside this task's allowed scope; this transient failure is preserved rather than hidden.
- Latest R4 `npm test` rerun — exit `0`, with 59 passed and 1 skipped across 12 test files.
- `git diff --check` — exit `0` after the R4 handoff update.

## Handoff Diagnostics

- blocker preserved: kind `state_corruption`, signature `state-corruption-blocked-feature-002-configuration-model-is-blocked-and-needs-diagnosis-autocorr`, with the recorded evidence that the feature is blocked and needs bounded diagnosis/autocorrection.
- task lineage preserved: this task remains `F002-T05-C1-CORRECTION-HANDOFF`, parent `F002-T05-C1`, and this execution is doctor recovery `F002-T05-C1-CORRECTION-HANDOFF-DOCTOR-RECOVERY-R4`, following R3.
- recovery diff scope: `tests/main.test.ts` and this active handoff document only.
- no source, state, contract, `proto/`, or unrelated test paths were changed.
- re-entry status: latest doctor re-entry gates pass; the initial transient full-suite failure remains recorded, and no restoration bookkeeping was performed because state changes are outside this recovery's allowed scope.
- review policy: `no_review_loop`; doctor re-entry gates are the recorded quality gates above.
