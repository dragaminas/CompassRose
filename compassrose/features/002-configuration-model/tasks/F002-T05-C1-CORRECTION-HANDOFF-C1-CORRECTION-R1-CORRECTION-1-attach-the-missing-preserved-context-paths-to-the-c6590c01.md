# Task F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1: Attach the missing preserved context paths to the handoff artifact

## Task ID
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1-CORRECTION-1`

## Parent Task
`F002-T05-C1-CORRECTION-HANDOFF-C1-CORRECTION-R1`

## Parent Feature
`002-configuration-model`

## Goal
Repair only the adapter-owned handoff metadata by attaching non-empty implementation_context_paths for actual preserved task, implementer-prompt, and runtime-context artifacts, while retaining the already-complete repository state and existing quality-gate evidence.

## First Executable Step
Inspect the adapter-owned attempt handoff directory and verify that preserved copies of the task, implementer prompt, and runtime context exist; do not modify any repository file.

## Minimum Progress Evidence
- implementation.json contains a non-empty implementation_context_paths array with three existing files covering the task, prompt, and runtime context.
- The recorded paths resolve to actual preserved artifacts and are repeated consistently in implementation_notes.
- The repository still has changed_files=[] and an empty live git diff.

## Review Findings
- implementation.json omits the required implementation_context_paths field.
- The notes name ordinary repository contracts but state that preserved adapter/runtime context artifacts are absent.
- The missing evidence must be repaired in the adapter/handoff layer because the implementer scope does not permit repository changes for this task.

## Scope
Allowed:
- `adapter-owned attempt handoff artifacts only: implementation.json, quality-gates.json, and preserved task/prompt/runtime-context artifacts`

Forbidden:
- `tests/main.test.ts`
- `src/**`
- `docs/**`
- `proto/**`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `all other repository paths`

## Constraints
- Do not modify repository files or create a source/test diff.
- Do not fabricate context paths; every listed path must point to an existing preserved artifact.
- Keep changed_files empty, git_diff empty, fallback_changed_files empty, and fallback_git_diff null.
- Keep implementation_notes non-empty and consistent with the structured context paths and already_complete status.
- Do not use raw_output as a substitute for structured implementation_context_paths.

## Acceptance Criteria
- implementation.json contains a non-empty implementation_context_paths array with actual preserved task, implementer-prompt, and runtime-context artifact paths.
- implementation_notes names the same paths and states that the repository behavior was already complete with an empty live diff.
- The repository remains unchanged and no forbidden path is changed.
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
