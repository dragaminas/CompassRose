# Task 014: Invoke the configured planner for task_planning_pending features

## Task ID
`F002-T14`

## Parent Feature
`002-configuration-model`

## Goal
Extend the existing CLI task-planning branch so a selected task_planning_pending feature invokes the repository-configured generic external_cli planner exactly once and reports deterministic success or failure instead of only logging the action boundary.

## First Executable Step
Add a focused test in tests/main.test.ts that configures a deterministic local planner command for a task_planning_pending feature and asserts the command is invoked exactly once for the selected feature.

## Minimum Progress Evidence
- tests/main.test.ts contains a new focused configured-planner invocation test.
- src/cli/main.ts contains the corresponding planner invocation in the task_planning_pending branch.
- The focused test fails before the CLI invocation is implemented and passes after the source change.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The validated project configuration is still not consumed by a concrete task-planning orchestration entrypoint; task_planning_pending currently only reports dispatch.

## Context
- The canonical feature lifecycle is formalized with no active task, correction task, or unblock task, so the next valid action is task planning. The CLI already persists the formalized-to-task_planning_pending transition, reports the post-transition lifecycle value, and has an exact full-content regression test. The remaining gap is actual configured planner invocation for task_planning_pending.

## Scope
Allowed:
- `src/cli/main.ts`
- `tests/main.test.ts`

Forbidden:
- `docs/`
- `src/contracts/`
- `src/config/`
- `src/doctor/`
- `src/proto/`
- `tests/configReader.test.ts`
- `tests/doctorCommand.test.ts`

## Constraints
- Use task_planning_pending as the operational decision input and preserve deterministic feature selection ordering.
- Use the configured generic external_cli adapter and its existing command/argument configuration; do not add provider-specific behavior.
- Do not modify global external-tool configuration or introduce a new configuration source.
- Do not claim task-ready success when the configured planner command is missing, fails, or produces an invalid result.
- Preserve the exact formalized transition handoff, including the post-persistence task_planning_pending selection report and non-lifecycle state content.
- Keep the doctor command and existing runtime preflight behavior unchanged.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A selected task_planning_pending feature invokes the configured external_cli planner exactly once after runtime preflight and identifies the selected feature in the deterministic output.
- The planner invocation uses repository-local configuration rather than a hard-coded provider or command.
- A missing or failing planner command returns a non-zero result with a task-planning diagnostic and does not report successful task generation or mutate the lifecycle state.
- The existing formalized transition test continues to assert the exact selection line with lifecycle state task_planning_pending and exact preservation of non-lifecycle state content.
- The focused main test, full test suite, typecheck, and whitespace check pass.

## Files Likely Affected
- `src/cli/main.ts`
- `src/config/configReader.ts`
- `tests/main.test.ts`
- `docs/compassrose/CONFIG.md`
- `src/contracts/planner/task-planning-prompt.md`
- `src/contracts/planner/input.md`
- `src/contracts/planner/output.md`
- `src/contracts/runtime/operation-loop.md`
- `docs/features/002-configuration-model/state.md`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts -t "task_planning_pending"
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
