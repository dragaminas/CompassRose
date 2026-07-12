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
Verify the implementation artifact contains non-empty implementation.notes and explicit handoff diagnostics.
```
