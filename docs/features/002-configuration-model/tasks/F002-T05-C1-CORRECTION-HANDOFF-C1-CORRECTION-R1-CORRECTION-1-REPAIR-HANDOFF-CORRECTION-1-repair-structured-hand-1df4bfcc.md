# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1: Repair structured handoff metadata and clear reported diff

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF-CORRECTION-1`

## Parent Task
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF`

## Parent Feature
`002-configuration-model`

## Goal
Repair only the adapter-owned implementation handoff fields: preserve the three existing attempt-specific context paths as structured implementation_context_paths and report no repository changes or fallback diff.

## First Executable Step
Open implementation.json, verify the three existing preserved paths named by the parent task, then set the outer handoff metadata to changed_files=[], git_diff=null or empty, fallback_changed_files=[], and fallback_git_diff=null without modifying source, test, documentation, or quality-gate files.

## Minimum Progress Evidence
- The implementation handoff contains structured implementation_context_paths with the existing task-context JSON, exact prompt text, and runtime-context JSON paths named by the parent task.
- The implementation handoff reports changed_files=[] and git_diff=null or empty, with fallback_changed_files=[] and fallback_git_diff=null.
- implementation_notes is non-empty, repeats the structured paths, and states already_complete with an empty live diff.

## Review Findings
- The submitted implementation artifact reports quality-gates.json in changed_files and includes a non-empty diff, violating the parent task's no-repository-change handoff requirement.
- The submitted implementation artifact omits structured implementation_context_paths and relies on raw_output and implementation_notes instead.

## Scope
Allowed:
- `implementation.json`

Forbidden:
- `quality-gates.json`
- `src/**`
- `tests/**`
- `docs/**`
- `proto/**`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `all other repository paths`

## Constraints
- Use only the existing preserved attempt-specific artifacts named by the parent task; do not substitute tracked repository contracts.
- Do not use raw_output as a substitute for structured implementation_context_paths.
- Keep changed_files empty, git_diff empty or null, fallback_changed_files empty, and fallback_git_diff null.
- Keep implementation_notes non-empty and consistent with the structured paths and already_complete status.
- Do not modify quality-gates.json or any source, test, documentation, configuration, or other repository path.

## Acceptance Criteria
- implementation_context_paths contains the three existing preserved attempt-specific files covering the task, exact implementer prompt, and runtime context.
- The outer handoff metadata reports changed_files=[] with git_diff empty or null, fallback_changed_files=[], and fallback_git_diff=null.
- implementation_notes repeats the same structured paths and states that repository behavior was already complete with an empty live diff.
- The implementation handoff includes a non-empty `## Implementation Notes` justification explaining the bounded repair and citing the recorded blocker evidence.
- The final doctor handoff includes a non-empty `## Implementation Notes` justification that explains the bounded recovery performed and cites the blocker evidence or already-complete restoration evidence.
- No forbidden path is changed.

## Quality Gates to Run
```bash
git diff --check -- tests/main.test.ts
npx vitest run tests/main.test.ts
npx vitest run tests/main.test.ts -t "returns 0 and prints preflight message when all runtime preconditions pass"
npx vitest run tests/main.test.ts -t "resolves CONFIG.md from repo root when invoked from a nested subdirectory with failing preflight"
npm run typecheck
npm test
```
