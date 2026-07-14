# Task 012: Align the CLI handoff report with the persisted lifecycle state

## Task ID
`F002-T12`

## Parent Feature
`002-configuration-model`

## Goal
Ensure that after a formalized feature is persisted as task_planning_pending, the CLI selection message reports task_planning_pending rather than the stale formalized value.

## First Executable Step
Extend the existing formalized transition test in tests/main.test.ts with an exact assertion for the selection message reporting lifecycle state task_planning_pending.

## Minimum Progress Evidence
- tests/main.test.ts contains an exact post-transition selection-state assertion.
- npx vitest run tests/main.test.ts -t "formalized feature transitions to task_planning_pending" passes.

## Trace
- Roadmap objective: Deterministic repository-local orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: src/cli/main.ts persists the formalized-to-task_planning_pending transition, but its selection report still uses the pre-transition formalized value, so the runtime handoff output and persisted lifecycle state disagree.

## Context
- The approved F002-T11-C1-CORRECTION-1 change proves that the formalized transition preserves complete state.md content and persists task_planning_pending. In the current CLI code, selectedLifecycle is assigned before the transition and is not updated afterward, causing the subsequent selection message to report formalized. This task corrects that narrow handoff inconsistency without starting planner execution.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `src/config/**`
- `src/doctor/**`
- `src/contracts/**`
- `docs/**`
- `tests/configReader.test.ts`
- `tests/doctorCommand.test.ts`
- `tests/projectState.test.ts`
- `tests/testUtils.ts`

## Constraints
- Use test_guided development.
- Update the reported lifecycle only after the formalized-to-task_planning_pending persistence succeeds.
- Preserve the existing exact state.md content-preservation assertion and transition message.
- Preserve preflight ordering, malformed-lifecycle handling, feature ordering, and completed-feature behavior.
- Do not invoke external tools, generate a task artifact, or implement planner execution in this task.
- Do not modify documentation, configuration loading, Doctor behavior, or unrelated tests.
- Keep the change limited to src/cli/main.ts and tests/main.test.ts.

## Development Policy
- `test_guided`

## Acceptance Criteria
- The formalized transition test asserts the exact selection message `CompassRose: selecting feature 002-formalized (lifecycle state: task_planning_pending)`.
- main([]) still returns 0 and persists task_planning_pending in state.md.
- The complete state.md content remains equal to the original content with only the lifecycle value changed.
- The transition output continues to identify formalized and task_planning_pending, and stderr remains empty.
- Existing main.ts preflight and lifecycle edge-case tests continue to pass.
- Only src/cli/main.ts and tests/main.test.ts are changed.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/state/feature-state.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/CONFIG.md`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts -t "formalized feature transitions to task_planning_pending"
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
