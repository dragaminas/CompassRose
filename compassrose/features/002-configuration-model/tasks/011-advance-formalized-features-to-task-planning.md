# Task 011: Advance formalized features to task planning

## Task ID
`F002-T11`

## Parent Feature
`002-configuration-model`

## Goal
Extend the CLI runtime beyond feature selection by persisting the operation-loop transition from formalized to task_planning_pending for the selected feature.

## First Executable Step
Edit tests/main.test.ts to add a failing main([]) fixture asserting that a selected formalized feature transitions its state.md lifecycle to task_planning_pending.

## Minimum Progress Evidence
- tests/main.test.ts contains an executable transition fixture with assertions for the updated lifecycle and preserved state content.
- src/cli/main.ts persists only the formalized to task_planning_pending transition after preflight and feature selection succeed.
- npx vitest run tests/main.test.ts passes.

## Trace
- Roadmap objective: Connect validated project-local configuration and deterministic feature-state handling to the broader runtime flow.
- Feature goal: Make the configuration-backed runtime progress a feature through the documented lifecycle without introducing provider-specific behavior.
- State gap: The CLI now validates preconditions and selects a feature, but a formalized feature remains formalized because the operation-loop transition to task_planning_pending is not yet persisted.

## Context
- Feature 002-configuration-model is formalized with no active task, and project state says the next valid action is task planning. The current approved F002-T10-C1 correction already handles missing state.md without request.md, so the advisory recovery lesson does not require another correction. This task addresses the next runtime gap: applying the documented formalized lifecycle transition while leaving task generation for a later task.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `docs/`
- `src/contracts/`
- `src/config/`
- `src/doctor/`
- `proto/`
- `package.json`
- `tests/other files`

## Constraints
- Use test_guided development: add the failing regression test before implementation changes.
- Preserve the existing preflight ordering, deterministic numeric feature selection, request_pending derivation, malformed-lifecycle diagnostics, and completed-feature handling.
- For a selected formalized feature, update only the lifecycle value in state.md and preserve the remaining state document content.
- Report the transition deterministically and stop at the task_planning_pending checkpoint; do not invoke external tools or generate a task artifact in this task.
- Do not modify configuration, contracts, doctor behavior, feature documentation, project state, or unrelated lifecycle transitions.

## Development Policy
- `test_guided`

## Acceptance Criteria
- With valid configuration and a selected feature whose lifecycle is formalized, main([]) returns 0 and persists task_planning_pending in that feature's state.md.
- The transition preserves all non-lifecycle state.md content and emits a deterministic message identifying the feature and the transition.
- The transition occurs only after runtime preflight succeeds; dirty-worktree, malformed-feature, and unsupported-configuration paths retain their existing failure behavior.
- Existing request_pending, completed-feature, lifecycle-validation, feature-ordering, and doctor regression tests remain passing.
- All listed quality gates pass.

## Files Likely Affected
- `src/cli/main.ts`
- `tests/main.test.ts`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/state/feature-state.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
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
