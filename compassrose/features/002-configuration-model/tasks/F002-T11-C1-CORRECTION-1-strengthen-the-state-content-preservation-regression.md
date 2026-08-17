# Task F002-T11-C1-CORRECTION-1: Strengthen the state-content preservation regression

## Task ID
`F002-T11-C1-CORRECTION-1`

## Parent Task
`F002-T11-C1`

## Parent Feature
`002-configuration-model`

## Goal
Strengthen the existing formalized-to-task_planning_pending test so it proves that only the lifecycle value changes and all other state.md content is preserved.

## First Executable Step
Edit the existing transition fixture in tests/main.test.ts to include representative non-lifecycle state content and compare the complete post-run state.md content with the original content after only formalized is replaced by task_planning_pending.

## Minimum Progress Evidence
- tests/main.test.ts contains non-lifecycle sentinel content and an exact postcondition proving that only the lifecycle value changed.
- npx vitest run tests/main.test.ts -t "formalized feature transitions to task_planning_pending" passes with the strengthened fixture.

## Review Findings
- The current transition test only checks that two headings remain; it does not verify preservation of arbitrary non-lifecycle state content required by the parent task.

## Scope
Allowed:
- `tests/main.test.ts`

Forbidden:
- `src/cli/main.ts`
- `docs/`
- `src/contracts/`
- `src/config/`
- `src/doctor/`
- `proto/`
- `package.json`
- `tests/other files`

## Constraints
- Do not change src/cli/main.ts; this correction closes the regression-evidence gap only.
- Preserve the existing preflight, deterministic feature selection, lifecycle diagnostics, and output assertions.
- Do not modify configuration, contracts, feature documentation, project state, or unrelated tests.

## Acceptance Criteria
- The existing transition fixture includes representative non-lifecycle state content and proves the complete state.md content is preserved except for the formalized to task_planning_pending lifecycle replacement.
- The focused transition test still asserts main([]) returns 0, the persisted lifecycle is task_planning_pending, and output identifies the feature and both lifecycle states.
- The full tests/main.test.ts suite remains passing.

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts -t "formalized feature transitions to task_planning_pending"
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check
```
