# Task 017: Add a cycle/depth limit to the correction-task ID allocator

## Task ID
`F002-T17`

## Parent Feature
`002-configuration-model`

## Goal
Bound buildStateCorrectionTaskId at the orchestrator recovery boundary so repeated recovery cannot generate unbounded near-duplicate correction-task documents.

## First Executable Step
Create tests/stateCorrectionLimit.test.ts with failing coverage for deterministic C1/C2 allocation below the configured limits.max_review_iterations boundary, refusal of the next same-anchor and nested correction allocation at that boundary, and the resulting non-continuing stop behavior.

## Minimum Progress Evidence
- tests/stateCorrectionLimit.test.ts contains executable regression coverage for below-limit, boundary, same-anchor over-limit, and nested-depth over-limit allocation.
- src/orchestrator/orchestrator.ts stores and enforces the existing limits.max_review_iterations policy at the state-correction allocation and recovery-step boundary; src/orchestrator/runtimeHelpers.ts is changed only if needed for a focused pure helper.
- At the limit, no additional correction-task markdown or JSON artifact is written and feature/project state is not advanced as though a correction task existed.
- The focused test and all required quality gates pass.

## Trace
- Roadmap objective: Provide a validated repository-local configuration contract that CompassRose can read and check as the project-level source of runtime policy.
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The feature's final implementation-outline item is not started. The orchestrator currently allocates state-correction IDs without a finite correction cycle/depth bound, while the runtime contract requires stopping when a correction iteration exceeds configured limits; repeated recovery can therefore create near-duplicate correction documents.

## Context
- The canonical project configuration defines limits.max_review_iterations as 1, and the runtime operation-loop contract requires stopping when a correction iteration exceeds configured limits. CompassRoseOrchestrator currently reads max_tasks_per_run but does not enforce max_review_iterations at buildStateCorrectionTask, and the correct_state recovery paths continue after creating each correction task. Existing task-ID tests prove unbounded C1/C2/C3 allocation but do not cover a configured ceiling. Use the existing orchestrator test-fixture/private-access patterns and preserve normal allocation below the ceiling.

## Scope
Allowed:
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `src/task/taskId.ts`
- `tests/`

Forbidden:

Note: `src/task/taskId.ts` was added to this task's scope directly, after the implementer's
actual diff added a pure helper (`limitStateCorrectionTaskId`) there -- a legitimate, necessary
touch the original scope had simply drawn too narrowly around, caught by the CLI's own
dirty-worktree preflight (comparing the live diff against this task's declared `allowedPaths`)
before review ever ran.

## Constraints
- Generate and implement exactly this one atomic task; do not split it into follow-up tasks.
- Use the existing limits.max_review_iterations configuration field; do not introduce a new configuration field, manifest, artifact type, or contract enum.
- Keep the limit finite even when no positive configured value is available; use the canonical configured value of 1 as the safe fallback rather than restoring unbounded allocation.
- Treat both the next correction number for the same task anchor and additional nested correction suffix depth as correction iterations; refuse allocation when either would exceed the configured limit.
- At the limit or beyond it, do not write a correction-task document, task artifact, or state update that claims a correction task exists; return the existing operation-loop-compatible non-continuing stop result with a diagnostic explaining that the correction limit was reached.
- Preserve deterministic allocation below the limit and preserve unrelated task allocation, review flow, and state-repair behavior.
- Do not modify configuration, documentation, task-ID source files outside the allowed boundary, proto harnesses, CLI code, or other orchestration modules.
- The supplied platform-preservation recovery lesson is unrelated advisory context and must not expand this task into configuration-loader or platform-value work.
- Do not commit changes during implementation; leave the allowed live diff available for review.

## Development Policy
- `test_guided`

## Acceptance Criteria
- CompassRoseOrchestrator enforces the existing limits.max_review_iterations value at state-correction ID allocation and recovery handling.
- With a limit of 2, allocation remains deterministic for C1 and C2, while a same-anchor C3 allocation is refused before any correction artifact or state mutation is written.
- Nested correction depth is also bounded: an allocation that would exceed the configured correction depth is refused before artifact or state mutation.
- With the canonical limit of 1, the first correction allocation is allowed and the next same-anchor or nested allocation stops without creating another near-duplicate document.
- The terminal path returns a non-continuing, non-success result through the existing runtime step handling and reports that the correction iteration/depth limit was reached.
- Tests cover normal allocation below the limit, the exact boundary, repeated same-anchor allocation, nested depth, artifact non-creation, and terminal step behavior.
- Only src/orchestrator/orchestrator.ts, src/orchestrator/runtimeHelpers.ts, and tests/ are changed.
- npx vitest run tests/stateCorrectionLimit.test.ts, npm run typecheck, npm test, and git diff --check pass.

## Files Likely Affected
- `docs/features/002-configuration-model/feature.md`
- `docs/features/002-configuration-model/state.md`
- `docs/compassrose/PROJECT_STATE.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/runtime/operation-loop.md`
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `tests/taskId.test.ts`
- `tests/schedulerPriority.test.ts`
- `tests/protoBlockerFlows.test.ts`
- `tests/`

## Quality Gates to Run
```bash
npx vitest run tests/stateCorrectionLimit.test.ts
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
