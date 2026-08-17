# Task 013: Dispatch task planning from the selected lifecycle state

## Task ID
`F002-T13`

## Parent Feature
`002-configuration-model`

## Goal
Extend the CLI runtime so a selected task_planning_pending feature reaches an explicit configured-planner action boundary instead of returning only the generic selection report.

## First Executable Step
Add a failing focused test in tests/main.test.ts for a selected task_planning_pending feature and its observable planner-action handoff.

## Minimum Progress Evidence
- tests/main.test.ts contains the new focused test and it fails before the source change.
- src/cli/main.ts contains the corresponding lifecycle-aware planner handoff branch.
- The final diff contains changes in both src/cli/main.ts and tests/main.test.ts only.

## Trace
- Roadmap objective: Deterministic Orchestration
- Feature goal: Define a repository-local configuration model that CompassRose can read, validate, and use as the project-level source of runtime policy.
- State gap: The current CLI validates project policy and selects features, but does not dispatch the selected task_planning_pending lifecycle action.

## Context
- The F002-T12 recovery hypothesis was checked against the allowed source and tests: the current CLI reports task_planning_pending after persistence, and the test asserts the exact full-line message while preserving non-lifecycle content. Plan the next remaining runtime-consumer task rather than duplicating that completed handoff behavior.

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
- `proto/`
- `package.json`
- `package-lock.json`

## Constraints
- Keep this to one CLI lifecycle-dispatch increment; do not implement the full planner, implementer, quality-gate, or reviewer loops.
- Use the validated project-level execution, roles, and external_cli policy without adding provider-specific behavior.
- Preserve deterministic feature ordering, preflight ordering, malformed-state diagnostics, and the existing formalized-to-task_planning_pending persistence and exact report.
- Do not modify documentation, contracts, configuration, adapters, or global tool settings.
- Make the planner handoff observable through an exact test assertion, not only broad substring checks.
- Do not claim completion based solely on pre-existing passing tests; require a live source-and-test diff.

## Development Policy
- `test_guided`

## Acceptance Criteria
- A selected task_planning_pending feature reaches an explicit planner-action handoff or deterministic configured-planner diagnostic instead of only the generic selection report.
- The focused test proves the handoff is observable and fails against the current implementation before the source change.
- The existing formalized-feature test still persists task_planning_pending and reports the post-persistence lifecycle value exactly.
- Feature ordering, preflight failures, completed-feature skipping, and malformed lifecycle diagnostics remain unchanged.
- Changes remain confined to src/cli/main.ts and tests/main.test.ts.

## Files Likely Affected
- `docs/features/002-configuration-model/state.md`
- `docs/features/002-configuration-model/architecture.md`
- `docs/compassrose/CONFIG.md`
- `src/contracts/runtime/operation-loop.md`
- `src/contracts/state/feature-state.md`
- `src/config/configReader.ts`
- `src/cli/main.ts`
- `tests/main.test.ts`

## Quality Gates to Run
```bash
npx vitest run tests/main.test.ts -t "task_planning_pending"
npx vitest run tests/main.test.ts
npm run typecheck
npm test
git diff --check
```

## Expected Deliverables
- `code`
- `tests`
