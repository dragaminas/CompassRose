# Task F002-T17-C1-CORRECTION-R1: Add byte-level correction artifact preservation assertions

## Task ID
`F002-T17-C1-CORRECTION-R1`

## Parent Task
`F002-T17-C1`

## Parent Feature
`002-configuration-model`

## Goal
Strengthen the existing correct_state refusal test so it proves all existing correction markdown and JSON artifact contents remain byte-for-byte unchanged when the iteration limit is reached.

## First Executable Step
Edit tests/stateCorrectionLimit.test.ts only: before invoking the existing correct_state step, snapshot the existence, paths, and UTF-8 contents of the files currently under tasksDirectory and artifactTasksDirectory, then assert those snapshots after refusal.

## Minimum Progress Evidence
- tests/stateCorrectionLimit.test.ts contains executable snapshots of existing correction markdown and JSON files before the correct_state call.
- The refusal assertions compare both artifact path sets and file contents exactly, while retaining the existing exitCode 2, continueLoop false, feature-state, and project-state assertions.

## Review Findings
- The current test compares only correction/artifact directory listings, not the byte contents of existing markdown/JSON files, so acceptance criterion 5 is not fully evidenced.

## Scope
Allowed:
- `tests/stateCorrectionLimit.test.ts`

Forbidden:
- `src/orchestrator/orchestrator.ts`
- `src/orchestrator/runtimeHelpers.ts`
- `src/task/taskId.ts`
- `docs/features/002-configuration-model/tasks/017.1-correct-state-correction-anchor-and-nested-depth-enforcement.md`
- `docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md`
- `docs/compassrose/CONFIG.md`
- `docs/compassrose/PROJECT_STATE.md`
- `all other paths not listed under allowed_paths`

## Constraints
- Use the existing tasksDirectory and artifactTasksDirectory paths and existing filesystem APIs in the test.
- Do not change runtime behavior, add production APIs, add configuration fields, or create new artifact types.
- Leave the existing source implementation and taskId cleanup unchanged.

## Acceptance Criteria
- Before correct_state refusal, the test snapshots every existing correction markdown and JSON file under the existing runtime directories.
- After refusal, the test proves the same files exist and each file has exactly the same UTF-8 content.
- The existing terminal-result and feature/project-state byte-preservation assertions remain passing.
- Only tests/stateCorrectionLimit.test.ts changes in the correction diff.

## Quality Gates to Run
```bash
npx vitest run tests/stateCorrectionLimit.test.ts
npm run typecheck
npm test
git diff --check
git diff --name-only --exit-code 023507f3 -- docs/features/002-configuration-model/tasks/017-add-a-cycle-depth-limit-to-the-correction-task-id-allocator.md
git diff --name-only --exit-code 023507f3 -- src/task/taskId.ts
```
