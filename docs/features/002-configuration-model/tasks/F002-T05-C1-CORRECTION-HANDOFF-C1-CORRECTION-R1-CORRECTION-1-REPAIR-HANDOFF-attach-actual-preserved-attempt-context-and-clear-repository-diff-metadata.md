# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF: Attach actual preserved attempt context and clear repository-diff metadata

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1-REPAIR-HANDOFF`

## Parent Task
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1`

## Parent Feature
`002-configuration-model`

## Goal
Repair only the adapter-owned handoff metadata by replacing tracked contract stand-ins with existing preserved task, prompt, and runtime-context artifacts, while reporting no repository changes.

## First Executable Step
Inspect the adapter-owned handoff directory and the supplied attempt-context paths; verify the required preserved artifacts exist before editing implementation.json.

## Minimum Progress Evidence
- implementation.json contains three existing preserved artifact paths covering the task, exact implementer prompt, and runtime context.
- The outer handoff metadata reports changed_files=[] and an empty or null git_diff, with fallback_changed_files=[] and fallback_git_diff=null.
- implementation_notes is non-empty and repeats the same structured paths while stating already_complete and an empty live diff.

## Review Findings
- Replace src/contracts/implementer/task-execution-prompt.md and src/contracts/runtime/agent-context.md with actual preserved attempt-specific artifacts; do not use tracked repository contracts as substitutes.
- Align the outer implementation handoff metadata with the task constraint: changed_files must be empty and git_diff must be empty or null.
- Preserve the already-complete repository state and do not create source, test, documentation, or other repository changes.

## Scope
Allowed:
- `implementation.json`
- `quality-gates.json`
- `logs/agent-contexts/run-2026-07-12--21-55-28-293/001-subtask-execution-implementer-subtask-f002-t05-c1-correction-handoff-c1-correction-r1-correction-1-attempt-1.json`
- `logs/agent-contexts/run-2026-07-12--21-55-28-293/001-subtask-execution-implementer-subtask-f002-t05-c1-correction-handoff-c1-correction-r1-correction-1-attempt-1.prompt.txt`
- `logs/agent-contexts/run-2026-07-12--21-55-28-293/002-subtask-execution-implementer-subtask-f002-t05-c1-correction-handoff-c1-correction-r1-correction-1-attempt-2.json`
- `logs/agent-contexts/run-2026-07-12--21-55-28-293/002-subtask-execution-implementer-subtask-f002-t05-correction-handoff-c1-correction-r1-correction-1-attempt-2.prompt.txt`

Forbidden:
- `src/**`
- `tests/**`
- `docs/**`
- `proto/**`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `all other repository paths`

## Constraints
- Do not modify repository source, test, documentation, or configuration files.
- Use only existing preserved attempt-specific artifacts; if they are unavailable, report the handoff blocker instead of substituting tracked contracts.
- Keep changed_files empty, git_diff empty or null, fallback_changed_files empty, and fallback_git_diff null.
- Keep implementation_notes non-empty and consistent with implementation_context_paths and already_complete status.
- Do not use raw_output as a substitute for structured implementation_context_paths.

## Acceptance Criteria
- implementation_context_paths contains three existing preserved attempt-specific files covering the task, exact implementer prompt, and runtime context.
- The outer handoff metadata reports no repository changes and no fallback diff.
- implementation_notes repeats the same paths and states that repository behavior was already complete with an empty live diff.
- No forbidden repository path is changed.
- All six required quality gates have fresh passing records.

## Quality Gates to Run
```bash
git diff --check -- tests/main.test.ts
npx vitest run tests/main.test.ts
npx vitest run tests/main.test.ts -t "returns 0 and prints preflight message when all runtime preconditions pass"
npx vitest run tests/main.test.ts -t "resolves CONFIG.md from repo root when invoked from a nested subdirectory with failing preflight"
npm run typecheck
npm test
```
